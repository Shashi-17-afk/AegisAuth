import { DEFAULT_RISK_CONFIG } from "./config.js";
import { evaluateBaseSignals } from "./signals/base.js";
import { evaluateCompoundSignals } from "./signals/compound.js";
import type {
  RiskAssessmentResult,
  RiskDecision,
  RiskEngineConfig,
  RiskEvaluationInput,
  RiskLevel,
} from "./types.js";

function clampScore(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function scoreToLevel(
  score: number,
  config: RiskEngineConfig = DEFAULT_RISK_CONFIG,
): RiskLevel {
  if (score <= config.thresholds.lowMax) return "LOW";
  if (score <= config.thresholds.mediumMax) return "MEDIUM";
  if (score <= config.thresholds.highMax) return "HIGH";
  return "CRITICAL";
}

export function levelToRecommendedDecision(
  level: RiskLevel,
  score: number,
  config: RiskEngineConfig = DEFAULT_RISK_CONFIG,
): RiskDecision {
  switch (level) {
    case "LOW":
      return "ALLOW";
    case "MEDIUM":
      return score >= config.decisions.mediumStepUpMinScore
        ? "STEP_UP"
        : "ALLOW";
    case "HIGH":
      return "STEP_UP";
    case "CRITICAL":
      return "DENY";
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

/**
 * Deterministic, explainable risk evaluation.
 * Same input + config → same output. No I/O.
 */
export function evaluateRisk(
  input: RiskEvaluationInput,
  config: RiskEngineConfig = DEFAULT_RISK_CONFIG,
): RiskAssessmentResult {
  const base = evaluateBaseSignals(input, config);
  const compounds = evaluateCompoundSignals(base, config);
  const signals = [...base, ...compounds];

  const raw = signals.reduce((sum, s) => sum + s.contribution, 0);
  const score = clampScore(raw, config.scoreMin, config.scoreMax);
  const level = scoreToLevel(score, config);
  const recommendedDecision = levelToRecommendedDecision(level, score, config);

  const reasons = signals
    .filter((s) => s.triggered && s.contribution > 0)
    .map((s) => `+${s.contribution} ${s.type}: ${s.reason}`);

  return {
    score,
    level,
    recommendedDecision,
    mode: config.mode,
    signals,
    reasons,
    evaluatedAt: input.evaluatedAt,
  };
}

/**
 * Whether authentication should be blocked under the configured mode.
 * OBSERVE always returns false (never blocks). ENFORCE blocks on DENY only.
 */
export function shouldEnforceDeny(
  assessment: Pick<RiskAssessmentResult, "recommendedDecision" | "mode">,
): boolean {
  return (
    assessment.mode === "ENFORCE" && assessment.recommendedDecision === "DENY"
  );
}
