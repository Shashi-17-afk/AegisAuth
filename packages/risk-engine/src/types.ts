/**
 * AegisAuth risk-engine — pure domain types.
 * No HTTP, Prisma, or framework dependencies.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RiskDecision = "ALLOW" | "STEP_UP" | "DENY";

export type RiskMode = "OBSERVE" | "ENFORCE";

export type RiskSignalSeverity = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type RiskSignalType =
  | "UNKNOWN_USER_AGENT"
  | "UNKNOWN_IP"
  | "RECENT_FAILURES"
  | "RAPID_ATTEMPTS"
  | "NEW_CREDENTIAL"
  | "NEW_ACCOUNT"
  | "HIGH_SESSION_COUNT"
  | "LONG_DORMANCY"
  | "COMPOUND_NEW_CONTEXT"
  | "COMPOUND_NEW_CONTEXT_WITH_FAILURES";

/**
 * Normalized inputs derived by the API context collector.
 * Missing optional context must be treated conservatively (not malicious).
 */
export type RiskEvaluationInput = {
  /** When the attempt is being evaluated (ISO or Date). */
  evaluatedAt: Date;
  authenticationSucceeded: boolean;
  /** Whether this credential ID has a prior successful authentication. */
  isKnownCredential: boolean;
  /** Whether this User-Agent string was seen on a prior success for the user. */
  isKnownUserAgent: boolean;
  /** Whether this IP was seen on a prior success for the user. */
  isKnownIpAddress: boolean;
  /** Failed auth events for this user in the short window (e.g. 10 minutes). */
  recentFailedAttemptsShort: number;
  /** Failed auth events for this user in the longer window (e.g. 1 hour). */
  recentFailedAttemptsLong: number;
  /** Auth attempts (success or failure) in the rapid window. */
  rapidAttemptCount: number;
  /** Active (non-revoked, non-expired) session count before this login. */
  activeSessionCount: number;
  /** Account age in milliseconds at evaluation time. */
  accountAgeMs: number;
  /** Milliseconds since last successful login; null if never succeeded before. */
  timeSinceLastSuccessfulLoginMs: number | null;
  /** Credential age in milliseconds. */
  credentialAgeMs: number;
};

export type RiskSignalResult = {
  type: RiskSignalType;
  triggered: boolean;
  contribution: number;
  severity: RiskSignalSeverity;
  reason: string;
};

export type RiskAssessmentResult = {
  score: number;
  level: RiskLevel;
  recommendedDecision: RiskDecision;
  mode: RiskMode;
  signals: RiskSignalResult[];
  reasons: string[];
  evaluatedAt: Date;
};

export type RiskEngineConfig = {
  mode: RiskMode;
  scoreMin: number;
  scoreMax: number;
  thresholds: {
    /** Inclusive upper bound for LOW (e.g. 24 → LOW is 0–24). */
    lowMax: number;
    /** Inclusive upper bound for MEDIUM. */
    mediumMax: number;
    /** Inclusive upper bound for HIGH; above is CRITICAL. */
    highMax: number;
  };
  weights: {
    unknownUserAgent: number;
    unknownIp: number;
    recentFailures: {
      shortNone: number;
      shortLowMax: number;
      shortLow: number;
      shortMediumMax: number;
      shortMedium: number;
      shortHigh: number;
      longBoostMax: number;
      longBoost: number;
    };
    rapidAttempts: {
      minCount: number;
      contribution: number;
    };
    newCredential: {
      maxAgeMs: number;
      contribution: number;
    };
    newAccount: {
      maxAgeMs: number;
      contribution: number;
    };
    highSessionCount: {
      minCount: number;
      contribution: number;
    };
    longDormancy: {
      minMs: number;
      contribution: number;
    };
    compoundNewContext: number;
    compoundNewContextWithFailures: number;
  };
  decisions: {
    /** MEDIUM scores at or above this recommend STEP_UP; below recommend ALLOW. */
    mediumStepUpMinScore: number;
  };
};
