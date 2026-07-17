import type {
  AuthenticationEventType,
  Prisma,
} from "@aegisauth/database";
import { prisma } from "@aegisauth/database";

type EventInput = {
  type: AuthenticationEventType;
  success: boolean;
  platformUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/** Persist a non-sensitive authentication event. Never log tokens or private keys. */
export async function recordAuthEvent(input: EventInput): Promise<void> {
  await prisma.authenticationEvent.create({
    data: {
      type: input.type,
      success: input.success,
      platformUserId: input.platformUserId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata,
    },
  });
}
