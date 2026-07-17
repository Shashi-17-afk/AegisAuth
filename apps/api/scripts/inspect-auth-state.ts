import { prisma } from "@aegisauth/database";

const users = await prisma.platformUser.findMany({
  include: {
    memberships: { include: { organization: true } },
    passkeys: true,
    sessions: true,
  },
  orderBy: { createdAt: "desc" },
});

console.log("USER_COUNT", users.length);
for (const u of users) {
  console.log("---");
  console.log("user_id", u.id);
  console.log(
    "email_masked",
    `${u.email.slice(0, 2)}***@${u.email.split("@")[1] ?? "?"}`,
  );
  console.log("displayName", u.displayName);
  console.log(
    "counts",
    `passkeys=${u.passkeys.length} sessions=${u.sessions.length} memberships=${u.memberships.length}`,
  );
  console.log(
    "memberships",
    u.memberships.map((m) => ({
      role: m.role,
      orgId: m.organization.id,
      orgName: m.organization.name,
    })),
  );
  console.log(
    "passkeys",
    u.passkeys.map((p) => ({
      id: p.id,
      deviceType: p.deviceType,
      backedUp: p.backedUp,
      counter: p.counter.toString(),
      credIdLen: p.credentialId.length,
      lastUsedAt: p.lastUsedAt,
    })),
  );
  console.log(
    "sessions",
    u.sessions.map((s) => ({
      id: s.id,
      revoked: Boolean(s.revokedAt),
      hashIsSha256: /^[a-f0-9]{64}$/.test(s.tokenHash),
      createdAt: s.createdAt,
    })),
  );
}

const events = await prisma.authenticationEvent.findMany({
  orderBy: { createdAt: "desc" },
  take: 12,
});
console.log(
  "EVENTS",
  events.map((e) => ({
    type: e.type,
    success: e.success,
    uid: e.platformUserId,
    at: e.createdAt,
  })),
);

await prisma.$disconnect();
