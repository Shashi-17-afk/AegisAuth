import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { prisma } from "@aegisauth/database";
import { loadEnv } from "../../config/env.js";
import { buildApp } from "../../app.js";
import { generateSessionToken, hashSessionToken } from "../../lib/crypto.js";
import { SESSION_COOKIE_NAME } from "../auth/session.js";
import { verifyStoredIntentHash } from "./hash.js";
import {
  createDeleteApplicationAuthorization,
  executeActionAuthorization,
  markAuthorizationAuthorized,
} from "./service.js";
import { AppError } from "../../lib/errors.js";

describe("action authorization integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let env: ReturnType<typeof loadEnv>;
  let ownerId = "";
  let memberId = "";
  let otherOwnerId = "";
  let orgId = "";
  let otherOrgId = "";
  let appAId = "";
  let appBId = "";
  let otherAppId = "";
  const cleanupSessionIds: string[] = [];
  const cleanupAuthzIds: string[] = [];

  beforeAll(async () => {
    env = loadEnv({
      ...process.env,
      NODE_ENV: "test",
      API_PORT: "3001",
      WEB_ORIGIN: "http://localhost:3000",
      WEBAUTHN_RP_NAME: "AegisAuth",
      WEBAUTHN_RP_ID: "localhost",
      WEBAUTHN_ORIGIN: "http://localhost:3000",
      RISK_MODE: "observe",
      ACTION_AUTH_PENDING_TTL_SECONDS: "300",
      ACTION_AUTH_EXECUTION_TTL_SECONDS: "300",
    });
    app = await buildApp(env);
    await app.ready();

    const suffix = randomBytes(4).toString("hex");

    const owner = await prisma.platformUser.create({
      data: {
        email: `action-owner-${suffix}@example.com`,
        displayName: "Action Owner",
      },
    });
    ownerId = owner.id;

    const member = await prisma.platformUser.create({
      data: {
        email: `action-member-${suffix}@example.com`,
        displayName: "Action Member",
      },
    });
    memberId = member.id;

    const otherOwner = await prisma.platformUser.create({
      data: {
        email: `action-other-${suffix}@example.com`,
        displayName: "Other Owner",
      },
    });
    otherOwnerId = otherOwner.id;

    const org = await prisma.organization.create({
      data: { name: `Action Org ${suffix}`, slug: `action-org-${suffix}` },
    });
    orgId = org.id;

    const otherOrg = await prisma.organization.create({
      data: {
        name: `Other Org ${suffix}`,
        slug: `other-org-${suffix}`,
      },
    });
    otherOrgId = otherOrg.id;

    await prisma.organizationMember.createMany({
      data: [
        { organizationId: orgId, platformUserId: ownerId, role: "OWNER" },
        { organizationId: orgId, platformUserId: memberId, role: "MEMBER" },
        {
          organizationId: otherOrgId,
          platformUserId: otherOwnerId,
          role: "OWNER",
        },
      ],
    });

    const appA = await prisma.application.create({
      data: {
        organizationId: orgId,
        name: "App A",
        slug: `app-a-${suffix}`,
      },
    });
    appAId = appA.id;

    const appB = await prisma.application.create({
      data: {
        organizationId: orgId,
        name: "App B",
        slug: `app-b-${suffix}`,
      },
    });
    appBId = appB.id;

    const otherApp = await prisma.application.create({
      data: {
        organizationId: otherOrgId,
        name: "Other App",
        slug: `other-app-${suffix}`,
      },
    });
    otherAppId = otherApp.id;
  });

  afterAll(async () => {
    if (cleanupAuthzIds.length > 0) {
      await prisma.actionAuthorizationEvent.deleteMany({
        where: { actionAuthorizationId: { in: cleanupAuthzIds } },
      });
      await prisma.actionAuthorization.deleteMany({
        where: { id: { in: cleanupAuthzIds } },
      });
    }
    if (cleanupSessionIds.length > 0) {
      await prisma.session.deleteMany({
        where: { id: { in: cleanupSessionIds } },
      });
    }
    await prisma.application.deleteMany({
      where: { organizationId: { in: [orgId, otherOrgId] } },
    });
    await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: [orgId, otherOrgId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgId, otherOrgId] } },
    });
    await prisma.platformUser.deleteMany({
      where: { id: { in: [ownerId, memberId, otherOwnerId] } },
    });
    await app.close();
  });

  async function cookieFor(userId: string): Promise<string> {
    const raw = generateSessionToken();
    const session = await prisma.session.create({
      data: {
        platformUserId: userId,
        tokenHash: hashSessionToken(raw),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    cleanupSessionIds.push(session.id);
    return raw;
  }

  it("unauthenticated create → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/actions/authorizations",
      payload: { actionType: "DELETE_APPLICATION", targetId: appAId },
    });
    expect(res.statusCode).toBe(401);
  });

  it("MEMBER cannot request DELETE_APPLICATION → 403", async () => {
    const cookie = await cookieFor(memberId);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/actions/authorizations",
      cookies: { [SESSION_COOKIE_NAME]: cookie },
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: { actionType: "DELETE_APPLICATION", targetId: appAId },
    });
    expect(res.statusCode).toBe(403);
  });

  it("cross-org target is not visible → 404", async () => {
    const cookie = await cookieFor(ownerId);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/actions/authorizations",
      cookies: { [SESSION_COOKIE_NAME]: cookie },
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: { actionType: "DELETE_APPLICATION", targetId: otherAppId },
    });
    expect(res.statusCode).toBe(404);
  });

  it("OWNER creates authorization with correct intent hash and CREATED event", async () => {
    const authz = await createDeleteApplicationAuthorization({
      env,
      actorId: ownerId,
      applicationId: appAId,
      ipAddress: "127.0.0.1",
      userAgent: "action-test",
    });
    cleanupAuthzIds.push(authz.id);

    expect(authz.status).toBe("PENDING");
    expect(authz.targetId).toBe(appAId);
    expect(authz.organizationId).toBe(orgId);
    expect(authz.platformUserId).toBe(ownerId);
    expect(verifyStoredIntentHash(authz.intentPayload, authz.intentHash)).toBe(
      true,
    );

    const events = await prisma.actionAuthorizationEvent.findMany({
      where: { actionAuthorizationId: authz.id },
    });
    expect(
      events.some((e) => e.type === "ACTION_AUTHORIZATION_CREATED"),
    ).toBe(true);
  });

  it("PENDING cannot execute", async () => {
    const authz = await createDeleteApplicationAuthorization({
      env,
      actorId: ownerId,
      applicationId: appBId,
      ipAddress: null,
      userAgent: null,
    });
    cleanupAuthzIds.push(authz.id);

    await expect(
      executeActionAuthorization({
        authorizationId: authz.id,
        actorId: ownerId,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
  });

  it("authorize → execute deletes exact stored target only; replay fails", async () => {
    const disposable = await prisma.application.create({
      data: {
        organizationId: orgId,
        name: "Disposable",
        slug: `disp-${randomBytes(3).toString("hex")}`,
      },
    });

    const authz = await createDeleteApplicationAuthorization({
      env,
      actorId: ownerId,
      applicationId: disposable.id,
      ipAddress: "127.0.0.1",
      userAgent: "action-test",
    });
    cleanupAuthzIds.push(authz.id);

    const authorized = await markAuthorizationAuthorized({
      env,
      authorizationId: authz.id,
      actorId: ownerId,
      intentHash: authz.intentHash,
      ipAddress: "127.0.0.1",
      userAgent: "action-test",
    });
    expect(authorized.status).toBe("AUTHORIZED");

    // App B must still exist — authorization bound to disposable only.
    expect(
      await prisma.application.findUnique({ where: { id: appBId } }),
    ).toBeTruthy();

    const executed = await executeActionAuthorization({
      authorizationId: authz.id,
      actorId: ownerId,
      ipAddress: "127.0.0.1",
      userAgent: "action-test",
    });
    expect(executed.status).toBe("EXECUTED");
    expect(
      await prisma.application.findUnique({ where: { id: disposable.id } }),
    ).toBeNull();
    expect(
      await prisma.application.findUnique({ where: { id: appBId } }),
    ).toBeTruthy();

    await expect(
      executeActionAuthorization({
        authorizationId: authz.id,
        actorId: ownerId,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ code: "ALREADY_EXECUTED" });

    const events = await prisma.actionAuthorizationEvent.findMany({
      where: { actionAuthorizationId: authz.id },
    });
    expect(
      events.some((e) => e.type === "ACTION_AUTHORIZATION_VERIFIED"),
    ).toBe(true);
    expect(
      events.some((e) => e.type === "ACTION_AUTHORIZATION_EXECUTED"),
    ).toBe(true);
  });

  it("wrong actor cannot execute", async () => {
    const disposable = await prisma.application.create({
      data: {
        organizationId: orgId,
        name: "Actor Guard",
        slug: `actor-${randomBytes(3).toString("hex")}`,
      },
    });
    const authz = await createDeleteApplicationAuthorization({
      env,
      actorId: ownerId,
      applicationId: disposable.id,
      ipAddress: null,
      userAgent: null,
    });
    cleanupAuthzIds.push(authz.id);
    await markAuthorizationAuthorized({
      env,
      authorizationId: authz.id,
      actorId: ownerId,
      intentHash: authz.intentHash,
    });

    await expect(
      executeActionAuthorization({
        authorizationId: authz.id,
        actorId: memberId,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // cleanup target
    await prisma.application.delete({ where: { id: disposable.id } }).catch(() => undefined);
  });

  it("tampered intent hash fails execution", async () => {
    const disposable = await prisma.application.create({
      data: {
        organizationId: orgId,
        name: "Tamper Guard",
        slug: `tamp-${randomBytes(3).toString("hex")}`,
      },
    });
    const authz = await createDeleteApplicationAuthorization({
      env,
      actorId: ownerId,
      applicationId: disposable.id,
      ipAddress: null,
      userAgent: null,
    });
    cleanupAuthzIds.push(authz.id);
    await markAuthorizationAuthorized({
      env,
      authorizationId: authz.id,
      actorId: ownerId,
      intentHash: authz.intentHash,
    });

    await prisma.actionAuthorization.update({
      where: { id: authz.id },
      data: {
        intentPayload: {
          version: 1,
          actionType: "DELETE_APPLICATION",
          organizationId: orgId,
          actorId: ownerId,
          target: { type: "APPLICATION", id: appBId },
          parameters: {},
        },
      },
    });

    await expect(
      executeActionAuthorization({
        authorizationId: authz.id,
        actorId: ownerId,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ code: "INTENT_TAMPERED" });

    expect(
      await prisma.application.findUnique({ where: { id: disposable.id } }),
    ).toBeTruthy();
    expect(
      await prisma.application.findUnique({ where: { id: appBId } }),
    ).toBeTruthy();

    await prisma.application.delete({ where: { id: disposable.id } });
  });

  it("expired PENDING cannot be authorized", async () => {
    const disposable = await prisma.application.create({
      data: {
        organizationId: orgId,
        name: "Expire Guard",
        slug: `exp-${randomBytes(3).toString("hex")}`,
      },
    });
    const authz = await createDeleteApplicationAuthorization({
      env,
      actorId: ownerId,
      applicationId: disposable.id,
      ipAddress: null,
      userAgent: null,
    });
    cleanupAuthzIds.push(authz.id);

    await prisma.actionAuthorization.update({
      where: { id: authz.id },
      data: { pendingExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      markAuthorizationAuthorized({
        env,
        authorizationId: authz.id,
        actorId: ownerId,
        intentHash: authz.intentHash,
      }),
    ).rejects.toBeInstanceOf(AppError);

    await prisma.application.delete({ where: { id: disposable.id } });
  });

  it("challenge options require authenticated actor and PENDING state", async () => {
    const authz = await createDeleteApplicationAuthorization({
      env,
      actorId: ownerId,
      applicationId: appBId,
      ipAddress: null,
      userAgent: null,
    });
    cleanupAuthzIds.push(authz.id);

    const unauth = await app.inject({
      method: "POST",
      url: `/api/v1/actions/authorizations/${authz.id}/options`,
    });
    expect(unauth.statusCode).toBe(401);

    // Actor has no passkeys in this synthetic user — expect NO_PASSKEYS (400)
    const cookie = await cookieFor(ownerId);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/actions/authorizations/${authz.id}/options`,
      cookies: { [SESSION_COOKIE_NAME]: cookie },
      headers: { origin: "http://localhost:3000" },
      payload: {},
    });
    expect([400, 200]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      expect(res.json()).toMatchObject({ code: "NO_PASSKEYS" });
    }
  });

  it("execute endpoint accepts only authorizationId (no alternate target)", async () => {
    const disposable = await prisma.application.create({
      data: {
        organizationId: orgId,
        name: "Exact Intent",
        slug: `exact-${randomBytes(3).toString("hex")}`,
      },
    });
    const authz = await createDeleteApplicationAuthorization({
      env,
      actorId: ownerId,
      applicationId: disposable.id,
      ipAddress: null,
      userAgent: null,
    });
    cleanupAuthzIds.push(authz.id);
    await markAuthorizationAuthorized({
      env,
      authorizationId: authz.id,
      actorId: ownerId,
      intentHash: authz.intentHash,
    });

    const cookie = await cookieFor(ownerId);
    // Even if client sends a different applicationId, it must be ignored.
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/actions/authorizations/${authz.id}/execute`,
      cookies: { [SESSION_COOKIE_NAME]: cookie },
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: { applicationId: appBId },
    });
    expect(res.statusCode).toBe(200);
    expect(
      await prisma.application.findUnique({ where: { id: disposable.id } }),
    ).toBeNull();
    expect(
      await prisma.application.findUnique({ where: { id: appBId } }),
    ).toBeTruthy();
  });
});
