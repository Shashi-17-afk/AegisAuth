import type {
  ActionAuthorizationEventType,
  Prisma,
} from "@aegisauth/database";
import { prisma } from "@aegisauth/database";

export async function recordActionEvent(input: {
  actionAuthorizationId: string;
  type: ActionAuthorizationEventType;
  success: boolean;
  platformUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.actionAuthorizationEvent.create({
    data: {
      actionAuthorizationId: input.actionAuthorizationId,
      type: input.type,
      success: input.success,
      platformUserId: input.platformUserId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata,
    },
  });
}
