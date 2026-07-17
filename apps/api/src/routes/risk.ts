import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@aegisauth/database";
import {
  DEFAULT_RISK_CONFIG,
  evaluateRisk,
  type RiskEvaluationInput,
} from "@aegisauth/risk-engine";
import type { Env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { maskIpAddress } from "../lib/net.js";
import { resolveRiskAccessScope } from "../modules/risk/access.js";
import { buildRiskEngineConfig, riskModeFromEnv } from "../modules/risk/assess.js";
import { ensureAuth, requireAuth } from "../plugins/auth.js";

const simulateSchema = z.object({
  isKnownCredential: z.boolean(),
  isKnownUserAgent: z.boolean(),
  isKnownIpAddress: z.boolean(),
  recentFailedAttemptsShort: z.number().int().min(0).max(1000),
  recentFailedAttemptsLong: z.number().int().min(0).max(1000),
  rapidAttemptCount: z.number().int().min(0).max(1000),
  activeSessionCount: z.number().int().min(0).max(1000),
  accountAgeHours: z.number().min(0).max(3650 * 24),
  credentialAgeHours: z.number().min(0).max(3650 * 24),
  hoursSinceLastLogin: z.number().min(0).max(3650 * 24).nullable(),
});

function serializeAssessment(
  row: {
    id: string;
    platformUserId: string;
    authenticationEventId: string | null;
    score: number;
    level: string;
    recommendedDecision: string;
    enforcedDecision: string;
    mode: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    platformUser?: { id: string; email: string; displayName: string };
    signals?: Array<{
      id: string;
      type: string;
      triggered: boolean;
      contribution: number;
      severity: string;
      reason: string;
    }>;
  },
  includeSignals: boolean,
) {
  return {
    id: row.id,
    platformUserId: row.platformUserId,
    authenticationEventId: row.authenticationEventId,
    score: row.score,
    level: row.level,
    recommendedDecision: row.recommendedDecision,
    enforcedDecision: row.enforcedDecision,
    mode: row.mode,
    ipAddressMasked: maskIpAddress(row.ipAddress),
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
    user: row.platformUser
      ? {
          id: row.platformUser.id,
          email: row.platformUser.email,
          displayName: row.platformUser.displayName,
        }
      : undefined,
    signals: includeSignals
      ? (row.signals ?? []).map((s) => ({
          id: s.id,
          type: s.type,
          triggered: s.triggered,
          contribution: s.contribution,
          severity: s.severity,
          reason: s.reason,
        }))
      : undefined,
  };
}

export function riskRoutes(env: Env): FastifyPluginAsync {
  return async (app) => {
    app.get(
      "/api/v1/risk/summary",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);
        const scope = await resolveRiskAccessScope(request.auth.platformUserId);

        const [total, low, medium, high, critical, recent] = await Promise.all([
          prisma.riskAssessment.count({
            where: { platformUserId: { in: scope.visibleUserIds } },
          }),
          prisma.riskAssessment.count({
            where: {
              platformUserId: { in: scope.visibleUserIds },
              level: "LOW",
            },
          }),
          prisma.riskAssessment.count({
            where: {
              platformUserId: { in: scope.visibleUserIds },
              level: "MEDIUM",
            },
          }),
          prisma.riskAssessment.count({
            where: {
              platformUserId: { in: scope.visibleUserIds },
              level: "HIGH",
            },
          }),
          prisma.riskAssessment.count({
            where: {
              platformUserId: { in: scope.visibleUserIds },
              level: "CRITICAL",
            },
          }),
          prisma.riskAssessment.findMany({
            where: { platformUserId: { in: scope.visibleUserIds } },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: {
              platformUser: {
                select: { id: true, email: true, displayName: true },
              },
            },
          }),
        ]);

        return {
          mode: riskModeFromEnv(env),
          orgWide: scope.orgWide,
          totals: { total, low, medium, high, critical },
          recent: recent.map((row) => serializeAssessment(row, false)),
        };
      },
    );

    app.get(
      "/api/v1/risk/assessments",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);
        const scope = await resolveRiskAccessScope(request.auth.platformUserId);
        const query = z
          .object({
            limit: z.coerce.number().int().min(1).max(100).default(50),
          })
          .parse(request.query);

        const assessments = await prisma.riskAssessment.findMany({
          where: { platformUserId: { in: scope.visibleUserIds } },
          orderBy: { createdAt: "desc" },
          take: query.limit,
          include: {
            platformUser: {
              select: { id: true, email: true, displayName: true },
            },
            signals: { orderBy: { contribution: "desc" } },
          },
        });

        return {
          orgWide: scope.orgWide,
          assessments: assessments.map((row) => serializeAssessment(row, true)),
        };
      },
    );

    app.get(
      "/api/v1/risk/assessments/:id",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
        const scope = await resolveRiskAccessScope(request.auth.platformUserId);

        const assessment = await prisma.riskAssessment.findFirst({
          where: {
            id,
            platformUserId: { in: scope.visibleUserIds },
          },
          include: {
            platformUser: {
              select: { id: true, email: true, displayName: true },
            },
            signals: { orderBy: { contribution: "desc" } },
            authenticationEvent: {
              select: {
                id: true,
                type: true,
                success: true,
                createdAt: true,
              },
            },
          },
        });

        if (!assessment) {
          throw new AppError(404, "NOT_FOUND", "Risk assessment not found");
        }

        return {
          assessment: {
            ...serializeAssessment(assessment, true),
            authenticationEvent: assessment.authenticationEvent
              ? {
                  id: assessment.authenticationEvent.id,
                  type: assessment.authenticationEvent.type,
                  success: assessment.authenticationEvent.success,
                  createdAt:
                    assessment.authenticationEvent.createdAt.toISOString(),
                }
              : null,
          },
        };
      },
    );

    app.get(
      "/api/v1/risk/events",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);
        const scope = await resolveRiskAccessScope(request.auth.platformUserId);
        const query = z
          .object({
            limit: z.coerce.number().int().min(1).max(100).default(50),
          })
          .parse(request.query);

        const events = await prisma.authenticationEvent.findMany({
          where: {
            platformUserId: { in: scope.visibleUserIds },
            type: {
              in: [
                "PASSKEY_AUTHENTICATION_SUCCESS",
                "PASSKEY_AUTHENTICATION_FAILURE",
                "PASSKEY_REGISTRATION_SUCCESS",
                "PASSKEY_REGISTRATION_FAILURE",
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          take: query.limit,
          include: {
            platformUser: {
              select: { id: true, email: true, displayName: true },
            },
            riskAssessments: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                signals: {
                  where: { triggered: true },
                  orderBy: { contribution: "desc" },
                },
              },
            },
          },
        });

        return {
          orgWide: scope.orgWide,
          events: events.map((event) => {
            const risk = event.riskAssessments[0] ?? null;
            return {
              id: event.id,
              type: event.type,
              success: event.success,
              createdAt: event.createdAt.toISOString(),
              ipAddressMasked: maskIpAddress(event.ipAddress),
              userAgent: event.userAgent,
              user: event.platformUser
                ? {
                    id: event.platformUser.id,
                    email: event.platformUser.email,
                    displayName: event.platformUser.displayName,
                  }
                : null,
              risk: risk
                ? serializeAssessment(risk, true)
                : null,
            };
          }),
        };
      },
    );

    /**
     * Risk simulator — authenticated, same evaluateRisk package, never persists,
     * never creates sessions. Clearly labeled SIMULATION in the response.
     */
    app.post(
      "/api/v1/risk/simulate",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);
        const body = simulateSchema.parse(request.body);
        const evaluatedAt = new Date();
        const riskInput: RiskEvaluationInput = {
          evaluatedAt,
          authenticationSucceeded: true,
          isKnownCredential: body.isKnownCredential,
          isKnownUserAgent: body.isKnownUserAgent,
          isKnownIpAddress: body.isKnownIpAddress,
          recentFailedAttemptsShort: body.recentFailedAttemptsShort,
          recentFailedAttemptsLong: body.recentFailedAttemptsLong,
          rapidAttemptCount: body.rapidAttemptCount,
          activeSessionCount: body.activeSessionCount,
          accountAgeMs: body.accountAgeHours * 60 * 60 * 1000,
          credentialAgeMs: body.credentialAgeHours * 60 * 60 * 1000,
          timeSinceLastSuccessfulLoginMs:
            body.hoursSinceLastLogin === null
              ? null
              : body.hoursSinceLastLogin * 60 * 60 * 1000,
        };

        const config = buildRiskEngineConfig(env);
        const result = evaluateRisk(riskInput, config);

        return {
          simulation: true,
          label: "SIMULATION",
          result: {
            score: result.score,
            level: result.level,
            recommendedDecision: result.recommendedDecision,
            mode: result.mode,
            reasons: result.reasons,
            signals: result.signals,
            evaluatedAt: result.evaluatedAt.toISOString(),
          },
          policyNote:
            "Initial policy weights for deterministic evaluation — not calibrated fraud probabilities.",
          defaults: {
            thresholds: DEFAULT_RISK_CONFIG.thresholds,
            weights: DEFAULT_RISK_CONFIG.weights,
          },
        };
      },
    );
  };
}
