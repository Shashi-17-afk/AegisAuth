import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransportFuture,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@aegisauth/database";
import type { FastifyReply } from "fastify";
import type { Env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { normalizeIpAddress, normalizeUserAgent } from "../../lib/net.js";
import { assessAndPersistRisk } from "../risk/assess.js";
import { buildRiskContext } from "../risk/context.js";
import { consumeChallenge, storeChallenge } from "./challenges.js";
import { recordAuthEvent } from "./events.js";
import { createSession } from "./session.js";

/**
 * Prefer usernameless / discoverable credential authentication.
 * Empty allowCredentials lets the authenticator present matching passkeys.
 */
export async function beginAuthentication(input: { env: Env }) {
  const options = await generateAuthenticationOptions({
    rpID: input.env.WEBAUTHN_RP_ID,
    userVerification: "preferred",
    // Omit allowCredentials for discoverable (usernameless) passkey UX.
  });

  const expiresAt = new Date(
    Date.now() + input.env.WEBAUTHN_CHALLENGE_TTL_SECONDS * 1000,
  );

  await storeChallenge({
    challenge: options.challenge,
    type: "AUTHENTICATION",
    expiresAt,
  });

  return options;
}

export async function completeAuthentication(input: {
  env: Env;
  response: AuthenticationResponseJSON;
  reply: FastifyReply;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  const credentialId = input.response.id;
  const ipAddress = normalizeIpAddress(input.ipAddress);
  const userAgent = normalizeUserAgent(input.userAgent);

  const stored = await prisma.passkeyCredential.findUnique({
    where: { credentialId },
    include: { platformUser: true },
  });

  if (!stored) {
    await recordAuthEvent({
      type: "PASSKEY_AUTHENTICATION_FAILURE",
      success: false,
      ipAddress,
      userAgent,
      metadata: { reason: "UNKNOWN_CREDENTIAL" },
    });
    throw new AppError(401, "AUTH_FAILED", "Authentication failed");
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: async (challenge) => {
        await consumeChallenge({
          challenge,
          type: "AUTHENTICATION",
        });
        return true;
      },
      expectedOrigin: input.env.WEBAUTHN_ORIGIN,
      expectedRPID: input.env.WEBAUTHN_RP_ID,
      requireUserVerification: false,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: Number(stored.counter),
        transports: stored.transports as AuthenticatorTransportFuture[],
      },
    });
  } catch (error) {
    await recordAuthEvent({
      type: "PASSKEY_AUTHENTICATION_FAILURE",
      success: false,
      platformUserId: stored.platformUserId,
      ipAddress,
      userAgent,
      metadata: {
        reason: error instanceof AppError ? error.code : "VERIFICATION_FAILED",
        credentialId: stored.credentialId,
      },
    });
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(401, "AUTH_FAILED", "Authentication failed");
  }

  if (!verification.verified) {
    await recordAuthEvent({
      type: "PASSKEY_AUTHENTICATION_FAILURE",
      success: false,
      platformUserId: stored.platformUserId,
      ipAddress,
      userAgent,
      metadata: { reason: "NOT_VERIFIED", credentialId: stored.credentialId },
    });
    throw new AppError(401, "AUTH_FAILED", "Authentication failed");
  }

  /**
   * Counter handling: persist the library's newCounter when it advances.
   * Synced passkeys may report counter 0 or non-incrementing values; we follow
   * SimpleWebAuthn's verified newCounter rather than inventing clone-detection.
   */
  const newCounter = verification.authenticationInfo.newCounter;

  // Risk context BEFORE mutating lastUsedAt / recording success (observe prior history).
  let riskBlocked = false;
  let riskAssessmentId: string | null = null;

  try {
    const riskInput = await buildRiskContext({
      platformUser: stored.platformUser,
      credential: stored,
      ipAddress,
      userAgent,
    });

    await prisma.passkeyCredential.update({
      where: { id: stored.id },
      data: {
        counter: BigInt(newCounter),
        lastUsedAt: new Date(),
        backedUp: verification.authenticationInfo.credentialBackedUp,
        deviceType: verification.authenticationInfo.credentialDeviceType,
      },
    });

    const authEvent = await recordAuthEvent({
      type: "PASSKEY_AUTHENTICATION_SUCCESS",
      success: true,
      platformUserId: stored.platformUserId,
      ipAddress,
      userAgent,
      metadata: { credentialId: stored.credentialId },
    });

    try {
      const { record, blocked } = await assessAndPersistRisk({
        env: input.env,
        platformUserId: stored.platformUserId,
        authenticationEventId: authEvent.id,
        riskInput,
        ipAddress,
        userAgent,
      });
      riskAssessmentId = record.id;
      riskBlocked = blocked;
    } catch (riskError) {
      // Fail-safe: risk engine must not corrupt authentication state.
      console.error("[risk] assessment failed; continuing auth", riskError);
    }
  } catch (error) {
    // If credential update / event recording fails, surface as auth failure.
    throw error;
  }

  // Phase 3 OBSERVE: riskBlocked is always false. ENFORCE scaffold may deny.
  if (riskBlocked) {
    throw new AppError(
      403,
      "RISK_DENIED",
      "Authentication denied by risk policy",
    );
  }

  await createSession({
    env: input.env,
    platformUserId: stored.platformUserId,
    reply: input.reply,
    ipAddress,
    userAgent,
  });

  return {
    user: {
      id: stored.platformUser.id,
      email: stored.platformUser.email,
      displayName: stored.platformUser.displayName,
    },
    riskAssessmentId,
  };
}
