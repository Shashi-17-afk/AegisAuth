import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { prisma } from "@aegisauth/database";
import {
  DEFAULT_RISK_CONFIG,
  evaluateRisk,
  type RiskEvaluationInput,
} from "@aegisauth/risk-engine";
import { loadEnv } from "../../config/env.js";
import { buildApp } from "../../app.js";
import { generateSessionToken, hashSessionToken } from "../../lib/crypto.js";
import { assessAndPersistRisk } from "./assess.js";
import { resolveRiskAccessScope } from "./access.js";
import { SESSION_COOKIE_NAME } from "../auth/session.js";

function sampleInput(
  overrides: Partial<RiskEvaluationInput> = {},
): RiskEvaluationInput {
  return {
    evaluatedAt: new Date(),
    authenticationSucceeded: true,
    isKnownCredential: true,
    isKnownUserAgent: true,
    isKnownIpAddress: true,
    recentFailedAttemptsShort: 0,
    recentFailedAttemptsLong: 0,
    rapidAttemptCount: 1,
    activeSessionCount: 1,
    accountAgeMs: 30 * 24 * 60 * 60 * 1000,
    timeSinceLastSuccessfulLoginMs: 2 * 24 * 60 * 60 * 1000,
    credentialAgeMs: 14 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

describe("risk integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let env: ReturnType<typeof loadEnv>;
  let ownerUserId: string | null = null;
  let memberUserId: string | null = null;
  let ownerOrgId: string | null = null;
  const cleanupAssessmentIds: string[] = [];
  const cleanupSessionIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupOrgIds: string[] = [];

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
    });
    app = await buildApp(env);
    await app.ready();

    const suffix = randomBytes(4).toString("hex");

    const owner = await prisma.platformUser.create({
      data: {
        email: `risk-owner-${suffix}@example.com`,
        displayName: "Risk Owner",
      },
    });
    cleanupUserIds.push(owner.id);
    ownerUserId = owner.id;

    const org = await prisma.organization.create({
      data: {
        name: `Risk Org ${suffix}`,
        slug: `risk-org-${suffix}`,
      },
    });
    cleanupOrgIds.push(org.id);
    ownerOrgId = org.id;

    await prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        platformUserId: owner.id,
        role: "OWNER",
      },
    });

    const member = await prisma.platformUser.create({
      data: {
        email: `risk-member-${suffix}@example.com`,
        displayName: "Risk Member",
      },
    });
    cleanupUserIds.push(member.id);
    memberUserId = member.id;

    await prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        platformUserId: member.id,
        role: "MEMBER",
      },
    });
  });

  afterAll(async () => {
    if (cleanupAssessmentIds.length > 0) {
      await prisma.riskSignal.deleteMany({
        where: { riskAssessmentId: { in: cleanupAssessmentIds } },
      });
      await prisma.riskAssessment.deleteMany({
        where: { id: { in: cleanupAssessmentIds } },
      });
    }
    if (cleanupSessionIds.length > 0) {
      await prisma.session.deleteMany({
        where: { id: { in: cleanupSessionIds } },
      });
    }
    if (ownerOrgId) {
      await prisma.organizationMember.deleteMany({
        where: { organizationId: ownerOrgId },
      });
    }
    if (cleanupUserIds.length > 0) {
      await prisma.platformUser.deleteMany({
        where: { id: { in: cleanupUserIds } },
      });
    }
    if (cleanupOrgIds.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: cleanupOrgIds } },
      });
    }
    await app.close();
  });

  async function createSessionCookie(platformUserId: string): Promise<string> {
    const raw = generateSessionToken();
    const session = await prisma.session.create({
      data: {
        platformUserId,
        tokenHash: hashSessionToken(raw),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    cleanupSessionIds.push(session.id);
    return raw;
  }

  it("persists RiskAssessment linked to PlatformUser in observe mode", async () => {
    expect(ownerUserId).toBeTruthy();
    const authEvent = await prisma.authenticationEvent.create({
      data: {
        type: "PASSKEY_AUTHENTICATION_SUCCESS",
        success: true,
        platformUserId: ownerUserId!,
        ipAddress: "203.0.113.10",
        userAgent: "RiskIntegrationTest/1.0",
      },
    });

    const { record, assessment, blocked } = await assessAndPersistRisk({
      env,
      platformUserId: ownerUserId!,
      authenticationEventId: authEvent.id,
      riskInput: sampleInput({
        isKnownIpAddress: false,
        isKnownUserAgent: false,
      }),
      ipAddress: "203.0.113.10",
      userAgent: "RiskIntegrationTest/1.0",
    });
    cleanupAssessmentIds.push(record.id);

    expect(blocked).toBe(false);
    expect(assessment.mode).toBe("OBSERVE");
    expect(record.platformUserId).toBe(ownerUserId);
    expect(record.authenticationEventId).toBe(authEvent.id);
    expect(record.enforcedDecision).toBe("ALLOW");
    expect(record.recommendedDecision).toBe(assessment.recommendedDecision);

    const signals = await prisma.riskSignal.count({
      where: { riskAssessmentId: record.id },
    });
    expect(signals).toBeGreaterThan(0);
  });

  it("rejects unauthenticated risk requests with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/risk/summary",
    });
    expect(res.statusCode).toBe(401);
  });

  it("allows OWNER to read org-visible assessments", async () => {
    const cookie = await createSessionCookie(ownerUserId!);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/risk/assessments",
      cookies: { [SESSION_COOKIE_NAME]: cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      orgWide: boolean;
      assessments: Array<{ platformUserId: string }>;
    };
    expect(body.orgWide).toBe(true);
  });

  it("MEMBER cannot read another user's assessment by id", async () => {
    const ownerAssessment = await prisma.riskAssessment.findFirst({
      where: { platformUserId: ownerUserId! },
      orderBy: { createdAt: "desc" },
    });
    expect(ownerAssessment).toBeTruthy();

    const memberCookie = await createSessionCookie(memberUserId!);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/risk/assessments/${ownerAssessment!.id}`,
      cookies: { [SESSION_COOKIE_NAME]: memberCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("MEMBER scope resolves to self only", async () => {
    const scope = await resolveRiskAccessScope(memberUserId!);
    expect(scope.orgWide).toBe(false);
    expect(scope.visibleUserIds).toEqual([memberUserId]);
  });

  it("OWNER scope includes member user ids", async () => {
    const scope = await resolveRiskAccessScope(ownerUserId!);
    expect(scope.orgWide).toBe(true);
    expect(scope.visibleUserIds).toContain(ownerUserId);
    expect(scope.visibleUserIds).toContain(memberUserId);
  });

  it("observe mode never blocks even when engine recommends DENY-level score", async () => {
    const { blocked, assessment, record } = await assessAndPersistRisk({
      env,
      platformUserId: ownerUserId!,
      authenticationEventId: null,
      riskInput: sampleInput({
        isKnownIpAddress: false,
        isKnownUserAgent: false,
        recentFailedAttemptsShort: 20,
        recentFailedAttemptsLong: 30,
        rapidAttemptCount: 20,
        isKnownCredential: false,
        accountAgeMs: 1000,
        activeSessionCount: 20,
        timeSinceLastSuccessfulLoginMs: 200 * 24 * 60 * 60 * 1000,
        credentialAgeMs: 1000,
      }),
      ipAddress: "198.51.100.20",
      userAgent: "RiskBurst/1.0",
    });
    cleanupAssessmentIds.push(record.id);

    expect(assessment.score).toBe(100);
    expect(assessment.level).toBe("CRITICAL");
    expect(assessment.recommendedDecision).toBe("DENY");
    expect(assessment.mode).toBe("OBSERVE");
    expect(blocked).toBe(false);
    expect(record.enforcedDecision).toBe("ALLOW");
  });

  it("simulator endpoint returns SIMULATION without persisting", async () => {
    const before = await prisma.riskAssessment.count({
      where: { platformUserId: ownerUserId! },
    });
    const cookie = await createSessionCookie(ownerUserId!);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/risk/simulate",
      cookies: { [SESSION_COOKIE_NAME]: cookie },
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: {
        isKnownCredential: true,
        isKnownUserAgent: false,
        isKnownIpAddress: false,
        recentFailedAttemptsShort: 0,
        recentFailedAttemptsLong: 0,
        rapidAttemptCount: 1,
        activeSessionCount: 1,
        accountAgeHours: 720,
        credentialAgeHours: 720,
        hoursSinceLastLogin: 24,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { simulation: boolean; label: string };
    expect(body.simulation).toBe(true);
    expect(body.label).toBe("SIMULATION");

    const after = await prisma.riskAssessment.count({
      where: { platformUserId: ownerUserId! },
    });
    expect(after).toBe(before);

    // Same package defaults used by production path
    const expected = evaluateRisk(
      sampleInput({
        isKnownUserAgent: false,
        isKnownIpAddress: false,
      }),
      { ...DEFAULT_RISK_CONFIG, mode: "OBSERVE" },
    );
    expect(expected.score).toBe(
      DEFAULT_RISK_CONFIG.weights.unknownUserAgent +
        DEFAULT_RISK_CONFIG.weights.unknownIp +
        DEFAULT_RISK_CONFIG.weights.compoundNewContext,
    );
  });
});
