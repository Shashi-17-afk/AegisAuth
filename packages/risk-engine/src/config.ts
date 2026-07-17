import type { RiskEngineConfig } from "./types.js";

/**
 * Initial security policy weights for deterministic evaluation and demonstration.
 *
 * These are NOT scientifically calibrated fraud probabilities.
 * Production deployments should recalibrate using observed traffic and security
 * requirements. Individual weak signals are intentionally modest so that a
 * single legitimate change (new IP or browser update) cannot alone reach HIGH.
 *
 * Threshold rationale (0–100 scale, max theoretical sum before clamp ≈ 114):
 * - LOW (0–24): typical returning user with known context, or at most one weak signal
 * - MEDIUM (25–49): multiple weak signals or modest failure pressure
 * - HIGH (50–74): strong failure/rapid pressure and/or compound anomalies
 * - CRITICAL (75–100): severe compound pressure (would DENY under ENFORCE)
 */
export const DEFAULT_RISK_CONFIG: RiskEngineConfig = {
  mode: "OBSERVE",
  scoreMin: 0,
  scoreMax: 100,
  thresholds: {
    lowMax: 24,
    mediumMax: 49,
    highMax: 74,
  },
  weights: {
    // User-Agent is weak and spoofable — moderate only.
    unknownUserAgent: 12,
    // IPs change often (mobile, VPN, ISP) — keep modest.
    unknownIp: 10,
    recentFailures: {
      shortNone: 0,
      // 1–2 failures in short window
      shortLowMax: 2,
      shortLow: 8,
      // 3–5 failures
      shortMediumMax: 5,
      shortMedium: 18,
      // 6+ failures
      shortHigh: 28,
      // Extra if long-window failures exceed short (sustained probing)
      longBoostMax: 3,
      longBoost: 6,
    },
    rapidAttempts: {
      // Conservative: 5+ attempts in the rapid window (collected by API)
      minCount: 5,
      contribution: 15,
    },
    newCredential: {
      // First use / registered within 7 days
      maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      contribution: 6,
    },
    newAccount: {
      // Account younger than 24 hours
      maxAgeMs: 24 * 60 * 60 * 1000,
      contribution: 5,
    },
    highSessionCount: {
      // Laptop + phone + tablet is normal; only unusual counts contribute
      minCount: 6,
      contribution: 8,
    },
    longDormancy: {
      // 90 days without a successful login
      minMs: 90 * 24 * 60 * 60 * 1000,
      contribution: 7,
    },
    compoundNewContext: 8,
    compoundNewContextWithFailures: 15,
  },
  decisions: {
    mediumStepUpMinScore: 35,
  },
};

/** Time windows used by the API context collector (documented alongside weights). */
export const RISK_CONTEXT_WINDOWS = {
  /** Recent failures — short window. */
  failuresShortMs: 10 * 60 * 1000,
  /** Recent failures — long window. */
  failuresLongMs: 60 * 60 * 1000,
  /** Rapid attempt detection window. */
  rapidAttemptsMs: 2 * 60 * 1000,
} as const;
