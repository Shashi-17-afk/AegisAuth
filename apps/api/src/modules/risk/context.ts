import type {
  PasskeyCredential,
  PlatformUser,
} from "@aegisauth/database";
import { prisma } from "@aegisauth/database";
import {
  RISK_CONTEXT_WINDOWS,
  type RiskEvaluationInput,
} from "@aegisauth/risk-engine";
import { normalizeIpAddress, normalizeUserAgent } from "../../lib/net.js";

type BuildRiskContextInput = {
  platformUser: Pick<PlatformUser, "id" | "createdAt">;
  credential: Pick<PasskeyCredential, "id" | "credentialId" | "createdAt" | "lastUsedAt">;
  ipAddress: string | null;
  userAgent: string | null;
  evaluatedAt?: Date;
};

/**
 * Collect historical context for the risk engine.
 * DATA COLLECTION only — evaluation lives in @aegisauth/risk-engine.
 */
export async function buildRiskContext(
  input: BuildRiskContextInput,
): Promise<RiskEvaluationInput> {
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const ip = normalizeIpAddress(input.ipAddress);
  const ua = normalizeUserAgent(input.userAgent);
  const userId = input.platformUser.id;

  const shortSince = new Date(evaluatedAt.getTime() - RISK_CONTEXT_WINDOWS.failuresShortMs);
  const longSince = new Date(evaluatedAt.getTime() - RISK_CONTEXT_WINDOWS.failuresLongMs);
  const rapidSince = new Date(evaluatedAt.getTime() - RISK_CONTEXT_WINDOWS.rapidAttemptsMs);

  const [
    priorCredentialSuccess,
    knownIpSuccess,
    knownUaSuccess,
    recentFailedShort,
    recentFailedLong,
    rapidAttempts,
    activeSessions,
    lastSuccess,
  ] = await Promise.all([
    prisma.authenticationEvent.count({
      where: {
        platformUserId: userId,
        type: "PASSKEY_AUTHENTICATION_SUCCESS",
        success: true,
        // Prior successes only (before this attempt)
        createdAt: { lt: evaluatedAt },
        metadata: {
          path: ["credentialId"],
          equals: input.credential.credentialId,
        },
      },
    }),
    ip
      ? prisma.authenticationEvent.count({
          where: {
            platformUserId: userId,
            type: "PASSKEY_AUTHENTICATION_SUCCESS",
            success: true,
            ipAddress: ip,
            createdAt: { lt: evaluatedAt },
          },
        })
      : Promise.resolve(0),
    ua
      ? prisma.authenticationEvent.count({
          where: {
            platformUserId: userId,
            type: "PASSKEY_AUTHENTICATION_SUCCESS",
            success: true,
            userAgent: ua,
            createdAt: { lt: evaluatedAt },
          },
        })
      : Promise.resolve(0),
    prisma.authenticationEvent.count({
      where: {
        platformUserId: userId,
        success: false,
        type: {
          in: [
            "PASSKEY_AUTHENTICATION_FAILURE",
            "PASSKEY_REGISTRATION_FAILURE",
          ],
        },
        createdAt: { gte: shortSince, lt: evaluatedAt },
      },
    }),
    prisma.authenticationEvent.count({
      where: {
        platformUserId: userId,
        success: false,
        type: {
          in: [
            "PASSKEY_AUTHENTICATION_FAILURE",
            "PASSKEY_REGISTRATION_FAILURE",
          ],
        },
        createdAt: { gte: longSince, lt: evaluatedAt },
      },
    }),
    prisma.authenticationEvent.count({
      where: {
        platformUserId: userId,
        type: {
          in: [
            "PASSKEY_AUTHENTICATION_SUCCESS",
            "PASSKEY_AUTHENTICATION_FAILURE",
          ],
        },
        createdAt: { gte: rapidSince, lt: evaluatedAt },
      },
    }),
    prisma.session.count({
      where: {
        platformUserId: userId,
        revokedAt: null,
        expiresAt: { gt: evaluatedAt },
      },
    }),
    prisma.authenticationEvent.findFirst({
      where: {
        platformUserId: userId,
        type: "PASSKEY_AUTHENTICATION_SUCCESS",
        success: true,
        createdAt: { lt: evaluatedAt },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  // Prefer lastUsedAt / prior success event; also treat any prior success for user+credential.
  // Metadata filter may miss older events that lacked credentialId — fall back to lastUsedAt.
  const isKnownCredential =
    priorCredentialSuccess > 0 ||
    (input.credential.lastUsedAt !== null &&
      input.credential.lastUsedAt < evaluatedAt);

  // Missing IP/UA → treat as unknown but conservative (signal still applies lightly via engine).
  // If IP is null (unusual), treat as "not known" — still modest weight.
  const isKnownIpAddress = ip !== null && knownIpSuccess > 0;
  const isKnownUserAgent = ua !== null && knownUaSuccess > 0;

  return {
    evaluatedAt,
    authenticationSucceeded: true,
    isKnownCredential,
    isKnownUserAgent,
    isKnownIpAddress,
    recentFailedAttemptsShort: recentFailedShort,
    recentFailedAttemptsLong: recentFailedLong,
    // Include the current attempt in rapid counting (+1)
    rapidAttemptCount: rapidAttempts + 1,
    activeSessionCount: activeSessions,
    accountAgeMs: Math.max(
      0,
      evaluatedAt.getTime() - input.platformUser.createdAt.getTime(),
    ),
    timeSinceLastSuccessfulLoginMs: lastSuccess
      ? Math.max(0, evaluatedAt.getTime() - lastSuccess.createdAt.getTime())
      : null,
    credentialAgeMs: Math.max(
      0,
      evaluatedAt.getTime() - input.credential.createdAt.getTime(),
    ),
  };
}
