import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@aegisauth/database";
import type { Env } from "../../config/env.js";
import { uuidToBytes } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";
import { normalizeEmail, uniqueSlug } from "../../lib/strings.js";
import {
  consumeChallenge,
  storeChallenge,
  type RegistrationChallengeContext,
} from "./challenges.js";
import { recordAuthEvent } from "./events.js";
import { createSession } from "./session.js";
import type { FastifyReply } from "fastify";

export async function beginRegistration(input: {
  env: Env;
  email: string;
  displayName: string;
  organizationName: string;
}) {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  const organizationName = input.organizationName.trim();

  if (!email || !displayName || !organizationName) {
    throw new AppError(400, "VALIDATION_ERROR", "Missing required fields");
  }

  const existing = await prisma.platformUser.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists");
  }

  const provisionalUserId = randomUUID();

  const options = await generateRegistrationOptions({
    rpName: input.env.WEBAUTHN_RP_NAME,
    rpID: input.env.WEBAUTHN_RP_ID,
    userID: new Uint8Array(uuidToBytes(provisionalUserId)),
    userName: email,
    userDisplayName: displayName,
    attestationType: "none",
    // Prefer discoverable passkeys; do not force platform-only authenticators.
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: undefined,
    },
  });

  const expiresAt = new Date(
    Date.now() + input.env.WEBAUTHN_CHALLENGE_TTL_SECONDS * 1000,
  );

  const context: RegistrationChallengeContext = {
    provisionalUserId,
    email,
    displayName,
    organizationName,
  };

  await storeChallenge({
    challenge: options.challenge,
    type: "REGISTRATION",
    expiresAt,
    email,
    context,
  });

  return options;
}

export async function completeRegistration(input: {
  env: Env;
  response: RegistrationResponseJSON;
  reply: FastifyReply;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  let consumedChallengeId: string | null = null;
  let registrationContext: RegistrationChallengeContext | null = null;

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: async (challenge) => {
        const row = await consumeChallenge({
          challenge,
          type: "REGISTRATION",
        });
        consumedChallengeId = row.id;
        const ctx = row.context;
        if (
          ctx &&
          typeof ctx === "object" &&
          !Array.isArray(ctx) &&
          "provisionalUserId" in ctx &&
          "email" in ctx &&
          "displayName" in ctx &&
          "organizationName" in ctx
        ) {
          registrationContext = ctx as RegistrationChallengeContext;
        }
        return true;
      },
      expectedOrigin: input.env.WEBAUTHN_ORIGIN,
      expectedRPID: input.env.WEBAUTHN_RP_ID,
      // Matches authenticatorSelection.userVerification: 'preferred'
      requireUserVerification: false,
    });
  } catch (error) {
    await recordAuthEvent({
      type: "PASSKEY_REGISTRATION_FAILURE",
      success: false,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        reason: error instanceof AppError ? error.code : "VERIFICATION_FAILED",
        challengeId: consumedChallengeId,
      },
    });
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(400, "REGISTRATION_FAILED", "Passkey registration failed");
  }

  if (!verification.verified || !verification.registrationInfo) {
    await recordAuthEvent({
      type: "PASSKEY_REGISTRATION_FAILURE",
      success: false,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { reason: "NOT_VERIFIED" },
    });
    throw new AppError(400, "REGISTRATION_FAILED", "Passkey registration failed");
  }

  if (!registrationContext) {
    throw new AppError(400, "CHALLENGE_INVALID", "Missing registration context");
  }

  const ctx = registrationContext as RegistrationChallengeContext;
  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  const transports = (credential.transports ?? []) as AuthenticatorTransportFuture[];

  try {
    const result = await prisma.$transaction(async (tx) => {
      const emailTaken = await tx.platformUser.findUnique({
        where: { email: ctx.email },
      });
      if (emailTaken) {
        throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists");
      }

      const user = await tx.platformUser.create({
        data: {
          id: ctx.provisionalUserId,
          email: ctx.email,
          displayName: ctx.displayName,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: ctx.organizationName,
          slug: uniqueSlug(ctx.organizationName, user.id),
        },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          platformUserId: user.id,
          role: "OWNER",
        },
      });

      await tx.passkeyCredential.create({
        data: {
          platformUserId: user.id,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
          transports: transports.map(String),
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
        },
      });

      return { user, organization };
    });

    await recordAuthEvent({
      type: "PASSKEY_REGISTRATION_SUCCESS",
      success: true,
      platformUserId: result.user.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    await createSession({
      env: input.env,
      platformUserId: result.user.id,
      reply: input.reply,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
      },
    };
  } catch (error) {
    await recordAuthEvent({
      type: "PASSKEY_REGISTRATION_FAILURE",
      success: false,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        reason: error instanceof AppError ? error.code : "PERSISTENCE_FAILED",
      },
    });
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, "REGISTRATION_FAILED", "Could not complete registration");
  }
}
