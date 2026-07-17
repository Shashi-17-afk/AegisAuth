import type { Prisma, WebAuthnChallengeType } from "@aegisauth/database";
import { prisma } from "@aegisauth/database";
import { AppError } from "../../lib/errors.js";

export type RegistrationChallengeContext = {
  provisionalUserId: string;
  email: string;
  displayName: string;
  organizationName: string;
};

/**
 * Persist a new challenge. Challenges are short-lived and single-use.
 */
export async function storeChallenge(input: {
  challenge: string;
  type: WebAuthnChallengeType;
  expiresAt: Date;
  platformUserId?: string | null;
  email?: string | null;
  context?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.webAuthnChallenge.create({
    data: {
      challenge: input.challenge,
      type: input.type,
      expiresAt: input.expiresAt,
      platformUserId: input.platformUserId ?? null,
      email: input.email ?? null,
      context: input.context,
    },
  });
}

/**
 * Atomically consume a challenge (set usedAt) if it is unused, unexpired, and of the expected type.
 * Returns the challenge row after successful consume.
 * Prevents concurrent replay: only one transaction can set usedAt.
 */
export async function consumeChallenge(input: {
  challenge: string;
  type: WebAuthnChallengeType;
}) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.webAuthnChallenge.findUnique({
      where: { challenge: input.challenge },
    });

    if (!existing) {
      throw new AppError(400, "CHALLENGE_INVALID", "Invalid or unknown challenge");
    }

    if (existing.type !== input.type) {
      throw new AppError(400, "CHALLENGE_TYPE_MISMATCH", "Challenge type mismatch");
    }

    if (existing.usedAt) {
      throw new AppError(400, "CHALLENGE_REUSED", "Challenge has already been used");
    }

    if (existing.expiresAt <= now) {
      throw new AppError(400, "CHALLENGE_EXPIRED", "Challenge has expired");
    }

    const updated = await tx.webAuthnChallenge.updateMany({
      where: {
        id: existing.id,
        usedAt: null,
        expiresAt: { gt: now },
        type: input.type,
      },
      data: { usedAt: now },
    });

    if (updated.count !== 1) {
      throw new AppError(400, "CHALLENGE_REUSED", "Challenge has already been used");
    }

    return existing;
  });
}
