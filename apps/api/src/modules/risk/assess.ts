import type { RiskAssessment as DbRiskAssessment } from "@aegisauth/database";
import { prisma } from "@aegisauth/database";
import {
  DEFAULT_RISK_CONFIG,
  evaluateRisk,
  shouldEnforceDeny,
  type RiskAssessmentResult,
  type RiskEngineConfig,
  type RiskEvaluationInput,
  type RiskMode,
} from "@aegisauth/risk-engine";
import type { Env } from "../../config/env.js";
import { normalizeIpAddress, normalizeUserAgent } from "../../lib/net.js";

export function riskModeFromEnv(env: Env): RiskMode {
  return env.RISK_MODE === "enforce" ? "ENFORCE" : "OBSERVE";
}

export function buildRiskEngineConfig(env: Env): RiskEngineConfig {
  return {
    ...DEFAULT_RISK_CONFIG,
    mode: riskModeFromEnv(env),
  };
}

/**
 * Evaluate + persist a risk assessment.
 * Fail-safe: callers should catch errors so auth is not corrupted.
 */
export async function assessAndPersistRisk(input: {
  env: Env;
  platformUserId: string;
  authenticationEventId: string | null;
  riskInput: RiskEvaluationInput;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<{
  assessment: RiskAssessmentResult;
  record: DbRiskAssessment;
  blocked: boolean;
}> {
  const config = buildRiskEngineConfig(input.env);
  const assessment = evaluateRisk(input.riskInput, config);

  // Phase 3: OBSERVE never blocks. ENFORCE scaffold blocks only on DENY.
  const blocked = shouldEnforceDeny(assessment);
  const enforcedDecision = blocked ? "DENY" : "ALLOW";

  const record = await prisma.riskAssessment.create({
    data: {
      platformUserId: input.platformUserId,
      authenticationEventId: input.authenticationEventId,
      score: assessment.score,
      level: assessment.level,
      recommendedDecision: assessment.recommendedDecision,
      enforcedDecision,
      mode: assessment.mode,
      ipAddress: normalizeIpAddress(input.ipAddress),
      userAgent: normalizeUserAgent(input.userAgent),
      signals: {
        create: assessment.signals.map((signal) => ({
          type: signal.type,
          triggered: signal.triggered,
          contribution: signal.contribution,
          severity: signal.severity,
          reason: signal.reason,
        })),
      },
    },
  });

  return { assessment, record, blocked };
}
