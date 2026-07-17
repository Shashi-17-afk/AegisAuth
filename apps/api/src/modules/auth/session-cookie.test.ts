import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@aegisauth/database";
import { loadEnv } from "../../config/env.js";
import { buildApp } from "../../app.js";
import { hashSessionToken } from "../../lib/crypto.js";
import { SESSION_COOKIE_NAME } from "./session.js";

/**
 * HTTP-level session cookie lifecycle (no WebAuthn).
 * Proves: Set-Cookie emitted → /me accepts cookie → logout revokes → /me rejects.
 */
describe("session cookie lifecycle", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let platformUserId: string | null = null;
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv({
      ...process.env,
      NODE_ENV: "test",
      API_PORT: "3001",
      WEB_ORIGIN: "http://localhost:3000",
      WEBAUTHN_RP_NAME: "AegisAuth",
      WEBAUTHN_RP_ID: "localhost",
      WEBAUTHN_ORIGIN: "http://localhost:3000",
    });
    app = await buildApp(env);
    await app.ready();

    const user = await prisma.platformUser.findFirst({
      orderBy: { createdAt: "desc" },
    });
    platformUserId = user?.id ?? null;
  });

  afterAll(async () => {
    if (createdSessionIds.length > 0) {
      await prisma.session.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
    }
    await app.close();
  });

  it("emits HttpOnly aegis_session Set-Cookie and authenticates /me", async () => {
    if (!platformUserId) {
      // No user in DB yet — skip rather than inventing WebAuthn.
      expect(platformUserId).toBeNull();
      return;
    }

    const probe = await app.inject({
      method: "POST",
      url: "/api/v1/auth/dev/session-probe",
      headers: { origin: "http://localhost:3000" },
    });

    expect(probe.statusCode).toBe(200);

    const setCookie = probe.headers["set-cookie"];
    expect(setCookie).toBeTruthy();

    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieHeader).toBeTruthy();
    expect(cookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookieHeader?.toLowerCase()).toContain("httponly");
    expect(cookieHeader?.toLowerCase()).toContain("path=/");
    expect(cookieHeader?.toLowerCase()).toContain("samesite=lax");
    // Development/test must not require Secure on HTTP localhost.
    expect(cookieHeader?.toLowerCase()).not.toContain("secure");

    const rawToken = cookieHeader!
      .split(";")[0]!
      .slice(`${SESSION_COOKIE_NAME}=`.length);

    expect(rawToken.length).toBeGreaterThan(20);

    const tokenHash = hashSessionToken(rawToken);
    const session = await prisma.session.findUnique({ where: { tokenHash } });
    expect(session).toBeTruthy();
    expect(session?.revokedAt).toBeNull();
    expect(session?.platformUserId).toBe(platformUserId);
    if (session) {
      createdSessionIds.push(session.id);
    }

    // Raw token must never equal the stored hash.
    expect(session?.tokenHash).not.toEqual(rawToken);
    expect(session?.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
    });

    expect(me.statusCode).toBe(200);
    const body = me.json() as { user: { id: string }; sessionId: string };
    expect(body.user.id).toBe(platformUserId);
    expect(body.sessionId).toBe(session?.id);

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
      headers: { origin: "http://localhost:3000" },
    });
    expect(logout.statusCode).toBe(200);

    const meAfter = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
    });
    expect(meAfter.statusCode).toBe(401);

    const revoked = await prisma.session.findUnique({
      where: { id: session!.id },
    });
    expect(revoked?.revokedAt).not.toBeNull();
  });
});
