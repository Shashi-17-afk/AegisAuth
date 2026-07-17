import type { OrganizationRole } from "@aegisauth/database";
import { prisma } from "@aegisauth/database";

export type RiskAccessScope = {
  /** Platform user IDs the caller may view risk data for. */
  visibleUserIds: string[];
  /** True when caller can see org-wide authentication risk (OWNER/ADMIN). */
  orgWide: boolean;
};

/**
 * Organization isolation for risk APIs.
 *
 * Without an active-organization selector:
 * - OWNER/ADMIN see risk data for members of every organization they administer.
 * - MEMBER (and non-admin memberships) see only their own assessments.
 *
 * Visibility is the union of those rules across all memberships.
 */
export async function resolveRiskAccessScope(
  platformUserId: string,
): Promise<RiskAccessScope> {
  const memberships = await prisma.organizationMember.findMany({
    where: { platformUserId },
    select: { organizationId: true, role: true },
  });

  const adminOrgIds = memberships
    .filter((m) => m.role === "OWNER" || m.role === "ADMIN")
    .map((m) => m.organizationId);

  if (adminOrgIds.length === 0) {
    return { visibleUserIds: [platformUserId], orgWide: false };
  }

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: { in: adminOrgIds } },
    select: { platformUserId: true },
  });

  const ids = new Set<string>([platformUserId]);
  for (const m of members) {
    ids.add(m.platformUserId);
  }

  return { visibleUserIds: [...ids], orgWide: true };
}

export function isElevatedRole(role: OrganizationRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
