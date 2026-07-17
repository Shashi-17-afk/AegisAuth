import type {
  ActionAuthorization,
  ActionType,
  OrganizationRole,
  Prisma,
} from "@aegisauth/database";
import { prisma } from "@aegisauth/database";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransportFuture,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import type { Env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { consumeChallenge, storeChallenge } from "../auth/challenges.js";
import { hashActionIntentInput, verifyStoredIntentHash } from "./hash.js";
import { recordActionEvent } from "./events.js";
import { assertActionImplemented, assertCanRequestAction } from "./policy.js";

type ActionChallengeContext = {
  actionAuthorizationId: string;
  intentHash: string;
  platformUserId: string;
};

function isActionChallengeContext(
  value: unknown,
): value is ActionChallengeContext {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.actionAuthorizationId === "string" &&
    typeof v.intentHash === "string" &&
    typeof v.platformUserId === "string"
  );
}

async function getMembership(input: {
  platformUserId: string;
  organizationId: string;
}) {
  return prisma.organizationMember.findUnique({
    where: {
      organizationId_platformUserId: {
        organizationId: input.organizationId,
        platformUserId: input.platformUserId,
      },
    },
  });
}

async function markExpiredIfNeeded(
  authz: ActionAuthorization,
  now: Date,
): Promise<ActionAuthorization> {
  if (
    authz.status === "PENDING" &&
    authz.pendingExpiresAt <= now
  ) {
    const updated = await prisma.actionAuthorization.updateMany({
      where: { id: authz.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    if (updated.count === 1) {
      await recordActionEvent({
        actionAuthorizationId: authz.id,
        type: "ACTION_AUTHORIZATION_EXPIRED",
        success: false,
        platformUserId: authz.platformUserId,
        metadata: { stage: "PENDING" },
      });
      return { ...authz, status: "EXPIRED" };
    }
  }

  if (
    authz.status === "AUTHORIZED" &&
    authz.executionExpiresAt &&
    authz.executionExpiresAt <= now
  ) {
    const updated = await prisma.actionAuthorization.updateMany({
      where: { id: authz.id, status: "AUTHORIZED" },
      data: { status: "EXPIRED" },
    });
    if (updated.count === 1) {
      await recordActionEvent({
        actionAuthorizationId: authz.id,
        type: "ACTION_AUTHORIZATION_EXPIRED",
        success: false,
        platformUserId: authz.platformUserId,
        metadata: { stage: "AUTHORIZED" },
      });
      return { ...authz, status: "EXPIRED" };
    }
  }

  return authz;
}

export async function createDeleteApplicationAuthorization(input: {
  env: Env;
  actorId: string;
  applicationId: string;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  assertActionImplemented("DELETE_APPLICATION");

  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: { organization: true },
  });

  if (!application) {
    throw new AppError(404, "NOT_FOUND", "Application not found");
  }

  const membership = await getMembership({
    platformUserId: input.actorId,
    organizationId: application.organizationId,
  });

  if (!membership) {
    // Do not leak cross-org existence details.
    throw new AppError(404, "NOT_FOUND", "Application not found");
  }

  assertCanRequestAction("DELETE_APPLICATION", membership.role);

  const { intent, intentHash } = hashActionIntentInput({
    actionType: "DELETE_APPLICATION",
    organizationId: application.organizationId,
    actorId: input.actorId,
    targetType: "APPLICATION",
    targetId: application.id,
    parameters: {},
  });

  const pendingExpiresAt = new Date(
    Date.now() + input.env.ACTION_AUTH_PENDING_TTL_SECONDS * 1000,
  );

  const latestRisk = await prisma.riskAssessment.findFirst({
    where: { platformUserId: input.actorId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const displaySummary = {
    actionLabel: "Delete application",
    applicationName: application.name,
    applicationSlug: application.slug,
    organizationName: application.organization.name,
    organizationId: application.organizationId,
    applicationId: application.id,
  };

  const authorization = await prisma.actionAuthorization.create({
    data: {
      platformUserId: input.actorId,
      organizationId: application.organizationId,
      actionType: "DELETE_APPLICATION",
      targetType: "APPLICATION",
      targetId: application.id,
      intentPayload: intent as Prisma.InputJsonValue,
      intentHash,
      displaySummary: displaySummary as Prisma.InputJsonValue,
      status: "PENDING",
      riskAssessmentId: latestRisk?.id ?? null,
      pendingExpiresAt,
    },
  });

  await recordActionEvent({
    actionAuthorizationId: authorization.id,
    type: "ACTION_AUTHORIZATION_CREATED",
    success: true,
    platformUserId: input.actorId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: {
      actionType: "DELETE_APPLICATION",
      targetId: application.id,
      intentHash,
    },
  });

  return authorization;
}

export async function getActionAuthorizationForActor(input: {
  id: string;
  actorId: string;
}) {
  const authz = await prisma.actionAuthorization.findUnique({
    where: { id: input.id },
    include: {
      organization: { select: { id: true, name: true } },
      platformUser: {
        select: { id: true, email: true, displayName: true },
      },
      riskAssessment: {
        select: {
          id: true,
          score: true,
          level: true,
          recommendedDecision: true,
          enforcedDecision: true,
          mode: true,
        },
      },
      events: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!authz) {
    throw new AppError(404, "NOT_FOUND", "Action authorization not found");
  }

  const membership = await getMembership({
    platformUserId: input.actorId,
    organizationId: authz.organizationId,
  });

  if (!membership) {
    throw new AppError(404, "NOT_FOUND", "Action authorization not found");
  }

  // MEMBERs may only see their own authorizations; OWNER/ADMIN see org-wide.
  if (
    membership.role === "MEMBER" &&
    authz.platformUserId !== input.actorId
  ) {
    throw new AppError(404, "NOT_FOUND", "Action authorization not found");
  }

  await markExpiredIfNeeded(authz, new Date());

  return prisma.actionAuthorization.findUniqueOrThrow({
    where: { id: authz.id },
    include: {
      organization: { select: { id: true, name: true } },
      platformUser: {
        select: { id: true, email: true, displayName: true },
      },
      riskAssessment: {
        select: {
          id: true,
          score: true,
          level: true,
          recommendedDecision: true,
          enforcedDecision: true,
          mode: true,
        },
      },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function beginActionAuthorizationCeremony(input: {
  env: Env;
  authorizationId: string;
  actorId: string;
}) {
  let authz = await prisma.actionAuthorization.findUnique({
    where: { id: input.authorizationId },
  });

  if (!authz || authz.platformUserId !== input.actorId) {
    throw new AppError(404, "NOT_FOUND", "Action authorization not found");
  }

  authz = await markExpiredIfNeeded(authz, new Date());

  if (authz.status === "EXPIRED") {
    throw new AppError(410, "AUTHORIZATION_EXPIRED", "Authorization has expired");
  }

  if (authz.status !== "PENDING") {
    throw new AppError(
      409,
      "INVALID_STATE",
      `Authorization is ${authz.status} and cannot start a passkey ceremony`,
    );
  }

  const passkeys = await prisma.passkeyCredential.findMany({
    where: { platformUserId: input.actorId },
  });

  if (passkeys.length === 0) {
    throw new AppError(400, "NO_PASSKEYS", "No passkeys registered for this account");
  }

  const options = await generateAuthenticationOptions({
    rpID: input.env.WEBAUTHN_RP_ID,
    userVerification: "preferred",
    allowCredentials: passkeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
  });

  const expiresAt = new Date(
    Date.now() + input.env.WEBAUTHN_CHALLENGE_TTL_SECONDS * 1000,
  );

  const context: ActionChallengeContext = {
    actionAuthorizationId: authz.id,
    intentHash: authz.intentHash,
    platformUserId: input.actorId,
  };

  await storeChallenge({
    challenge: options.challenge,
    type: "ACTION_AUTHORIZATION",
    expiresAt,
    platformUserId: input.actorId,
    context: context as Prisma.InputJsonValue,
  });

  return { options, authorization: authz };
}

/**
 * After WebAuthn verification succeeds, atomically PENDING → AUTHORIZED.
 * Exported for tests that simulate a verified ceremony without a browser authenticator.
 */
export async function markAuthorizationAuthorized(input: {
  env: Env;
  authorizationId: string;
  actorId: string;
  intentHash: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const now = new Date();
  const executionExpiresAt = new Date(
    now.getTime() + input.env.ACTION_AUTH_EXECUTION_TTL_SECONDS * 1000,
  );

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.actionAuthorization.findUnique({
      where: { id: input.authorizationId },
    });

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Action authorization not found");
    }

    if (existing.platformUserId !== input.actorId) {
      throw new AppError(403, "FORBIDDEN", "Not the authorization actor");
    }

    if (existing.intentHash !== input.intentHash) {
      throw new AppError(409, "INTENT_MISMATCH", "Intent hash mismatch");
    }

    if (existing.status !== "PENDING") {
      throw new AppError(
        409,
        "INVALID_STATE",
        `Authorization is ${existing.status}`,
      );
    }

    if (existing.pendingExpiresAt <= now) {
      await tx.actionAuthorization.updateMany({
        where: { id: existing.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      throw new AppError(410, "AUTHORIZATION_EXPIRED", "Authorization has expired");
    }

    if (!verifyStoredIntentHash(existing.intentPayload, existing.intentHash)) {
      throw new AppError(409, "INTENT_TAMPERED", "Stored intent hash is invalid");
    }

    const updated = await tx.actionAuthorization.updateMany({
      where: {
        id: existing.id,
        status: "PENDING",
        intentHash: input.intentHash,
        platformUserId: input.actorId,
        pendingExpiresAt: { gt: now },
      },
      data: {
        status: "AUTHORIZED",
        authorizedAt: now,
        executionExpiresAt,
      },
    });

    if (updated.count !== 1) {
      throw new AppError(409, "INVALID_STATE", "Could not authorize (concurrent update)");
    }

    return tx.actionAuthorization.findUniqueOrThrow({
      where: { id: existing.id },
    });
  });

  await recordActionEvent({
    actionAuthorizationId: result.id,
    type: "ACTION_AUTHORIZATION_VERIFIED",
    success: true,
    platformUserId: input.actorId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: input.metadata,
  });

  return result;
}

export async function verifyActionAuthorization(input: {
  env: Env;
  authorizationId: string;
  actorId: string;
  response: AuthenticationResponseJSON;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  let authz = await prisma.actionAuthorization.findUnique({
    where: { id: input.authorizationId },
  });

  if (!authz || authz.platformUserId !== input.actorId) {
    throw new AppError(404, "NOT_FOUND", "Action authorization not found");
  }

  authz = await markExpiredIfNeeded(authz, new Date());

  if (authz.status === "EXPIRED") {
    throw new AppError(410, "AUTHORIZATION_EXPIRED", "Authorization has expired");
  }

  if (authz.status !== "PENDING") {
    throw new AppError(
      409,
      "INVALID_STATE",
      `Authorization is ${authz.status}`,
    );
  }

  const credential = await prisma.passkeyCredential.findUnique({
    where: { credentialId: input.response.id },
  });

  if (!credential || credential.platformUserId !== input.actorId) {
    await recordActionEvent({
      actionAuthorizationId: authz.id,
      type: "ACTION_AUTHORIZATION_FAILED",
      success: false,
      platformUserId: input.actorId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { reason: "WRONG_CREDENTIAL" },
    });
    throw new AppError(401, "AUTH_FAILED", "Passkey verification failed");
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: async (challenge) => {
        const consumed = await consumeChallenge({
          challenge,
          type: "ACTION_AUTHORIZATION",
        });

        if (!isActionChallengeContext(consumed.context)) {
          throw new AppError(400, "CHALLENGE_INVALID", "Invalid action challenge");
        }

        if (
          consumed.context.actionAuthorizationId !== authz!.id ||
          consumed.context.intentHash !== authz!.intentHash ||
          consumed.context.platformUserId !== input.actorId ||
          consumed.platformUserId !== input.actorId
        ) {
          throw new AppError(
            400,
            "CHALLENGE_MISMATCH",
            "Challenge is not bound to this authorization",
          );
        }

        return true;
      },
      expectedOrigin: input.env.WEBAUTHN_ORIGIN,
      expectedRPID: input.env.WEBAUTHN_RP_ID,
      requireUserVerification: false,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    await recordActionEvent({
      actionAuthorizationId: authz.id,
      type: "ACTION_AUTHORIZATION_FAILED",
      success: false,
      platformUserId: input.actorId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { reason: "VERIFICATION_FAILED" },
    });
    throw new AppError(401, "AUTH_FAILED", "Passkey verification failed");
  }

  if (!verification.verified) {
    throw new AppError(401, "AUTH_FAILED", "Passkey verification failed");
  }

  await prisma.passkeyCredential.update({
    where: { id: credential.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
      backedUp: verification.authenticationInfo.credentialBackedUp,
      deviceType: verification.authenticationInfo.credentialDeviceType,
    },
  });

  return markAuthorizationAuthorized({
    env: input.env,
    authorizationId: authz.id,
    actorId: input.actorId,
    intentHash: authz.intentHash,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: { credentialId: credential.credentialId },
  });
}

async function executeDeleteApplication(
  authz: ActionAuthorization,
  tx: Prisma.TransactionClient,
) {
  const deleted = await tx.application.deleteMany({
    where: {
      id: authz.targetId,
      organizationId: authz.organizationId,
    },
  });

  if (deleted.count !== 1) {
    throw new AppError(
      409,
      "TARGET_MISSING",
      "Application no longer exists or does not match stored intent",
    );
  }
}

export async function executeActionAuthorization(input: {
  authorizationId: string;
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.actionAuthorization.findUnique({
        where: { id: input.authorizationId },
      });

      if (!existing) {
        throw new AppError(404, "NOT_FOUND", "Action authorization not found");
      }

      if (existing.platformUserId !== input.actorId) {
        throw new AppError(403, "FORBIDDEN", "Not the authorization actor");
      }

      if (existing.status === "EXECUTED") {
        throw new AppError(
          409,
          "ALREADY_EXECUTED",
          "Authorization has already been executed",
        );
      }

      if (existing.status === "PENDING") {
        throw new AppError(
          409,
          "NOT_AUTHORIZED",
          "Authorization must be passkey-verified before execution",
        );
      }

      if (existing.status === "EXPIRED" || existing.status === "CANCELLED") {
        throw new AppError(
          410,
          "AUTHORIZATION_EXPIRED",
          `Authorization is ${existing.status}`,
        );
      }

      if (existing.status !== "AUTHORIZED") {
        throw new AppError(
          409,
          "INVALID_STATE",
          `Authorization is ${existing.status}`,
        );
      }

      if (!existing.executionExpiresAt || existing.executionExpiresAt <= now) {
        await tx.actionAuthorization.updateMany({
          where: { id: existing.id, status: "AUTHORIZED" },
          data: { status: "EXPIRED" },
        });
        throw new AppError(
          410,
          "AUTHORIZATION_EXPIRED",
          "Authorization has expired",
        );
      }

      if (!verifyStoredIntentHash(existing.intentPayload, existing.intentHash)) {
        await tx.actionAuthorization.updateMany({
          where: { id: existing.id, status: "AUTHORIZED" },
          data: {
            status: "FAILED",
            failedAt: now,
            failureReason: "INTENT_TAMPERED",
          },
        });
        throw new AppError(409, "INTENT_TAMPERED", "Stored intent hash is invalid");
      }

      // Atomic claim: AUTHORIZED → EXECUTED before side effects (concurrency-safe).
      const claimed = await tx.actionAuthorization.updateMany({
        where: {
          id: existing.id,
          status: "AUTHORIZED",
          platformUserId: input.actorId,
          executionExpiresAt: { gt: now },
        },
        data: {
          status: "EXECUTED",
          executedAt: now,
        },
      });

      if (claimed.count !== 1) {
        throw new AppError(
          409,
          "INVALID_STATE",
          "Could not execute (concurrent update)",
        );
      }

      try {
        if (existing.actionType === "DELETE_APPLICATION") {
          await executeDeleteApplication(existing, tx);
        } else {
          throw new AppError(
            422,
            "ACTION_NOT_IMPLEMENTED",
            "Action not implemented",
          );
        }
      } catch (error) {
        await tx.actionAuthorization.update({
          where: { id: existing.id },
          data: {
            status: "FAILED",
            failedAt: now,
            executedAt: null,
            failureReason:
              error instanceof AppError ? error.code : "EXECUTION_FAILED",
          },
        });
        throw error;
      }

      return tx.actionAuthorization.findUniqueOrThrow({
        where: { id: existing.id },
      });
    });

    await recordActionEvent({
      actionAuthorizationId: result.id,
      type: "ACTION_AUTHORIZATION_EXECUTED",
      success: true,
      platformUserId: input.actorId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        actionType: result.actionType,
        targetId: result.targetId,
      },
    });

    return result;
  } catch (error) {
    if (error instanceof AppError && error.code === "INTENT_TAMPERED") {
      await recordActionEvent({
        actionAuthorizationId: input.authorizationId,
        type: "ACTION_AUTHORIZATION_FAILED",
        success: false,
        platformUserId: input.actorId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: { reason: "INTENT_TAMPERED" },
      });
    }
    throw error;
  }
}

export async function cancelActionAuthorization(input: {
  authorizationId: string;
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  const existing = await prisma.actionAuthorization.findUnique({
    where: { id: input.authorizationId },
  });

  if (!existing || existing.platformUserId !== input.actorId) {
    throw new AppError(404, "NOT_FOUND", "Action authorization not found");
  }

  if (existing.status !== "PENDING" && existing.status !== "AUTHORIZED") {
    throw new AppError(
      409,
      "INVALID_STATE",
      `Authorization is ${existing.status} and cannot be cancelled`,
    );
  }

  const updated = await prisma.actionAuthorization.updateMany({
    where: {
      id: existing.id,
      platformUserId: input.actorId,
      status: { in: ["PENDING", "AUTHORIZED"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });

  if (updated.count !== 1) {
    throw new AppError(409, "INVALID_STATE", "Could not cancel authorization");
  }

  await recordActionEvent({
    actionAuthorizationId: existing.id,
    type: "ACTION_AUTHORIZATION_CANCELLED",
    success: true,
    platformUserId: input.actorId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return prisma.actionAuthorization.findUniqueOrThrow({
    where: { id: existing.id },
  });
}

export async function listActionAuthorizationsForUser(input: {
  actorId: string;
  limit?: number;
}) {
  const memberships = await prisma.organizationMember.findMany({
    where: { platformUserId: input.actorId },
    select: { organizationId: true, role: true },
  });

  const adminOrgIds = memberships
    .filter((m) => m.role === "OWNER" || m.role === "ADMIN")
    .map((m) => m.organizationId);

  const where =
    adminOrgIds.length > 0
      ? {
          OR: [
            { platformUserId: input.actorId },
            { organizationId: { in: adminOrgIds } },
          ],
        }
      : { platformUserId: input.actorId };

  return prisma.actionAuthorization.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 50,
    include: {
      organization: { select: { id: true, name: true } },
      platformUser: {
        select: { id: true, email: true, displayName: true },
      },
      riskAssessment: {
        select: {
          id: true,
          score: true,
          level: true,
          recommendedDecision: true,
          mode: true,
        },
      },
    },
  });
}

export type { ActionType, OrganizationRole };
