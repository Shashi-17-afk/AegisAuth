import type {
  RiskEvaluationInput,
  RiskEngineConfig,
  RiskSignalResult,
} from "../types.js";

export function evaluateUnknownUserAgent(
  input: RiskEvaluationInput,
  config: RiskEngineConfig,
): RiskSignalResult {
  if (input.isKnownUserAgent) {
    return {
      type: "UNKNOWN_USER_AGENT",
      triggered: false,
      contribution: 0,
      severity: "NONE",
      reason:
        "Browser/device profile matches a previously observed successful authentication for this account.",
    };
  }

  return {
    type: "UNKNOWN_USER_AGENT",
    triggered: true,
    contribution: config.weights.unknownUserAgent,
    severity: "MEDIUM",
    reason:
      "Authentication originated from a browser/device profile not previously observed for this account. User-Agent is weak evidence and may change legitimately.",
  };
}

export function evaluateUnknownIp(
  input: RiskEvaluationInput,
  config: RiskEngineConfig,
): RiskSignalResult {
  if (input.isKnownIpAddress) {
    return {
      type: "UNKNOWN_IP",
      triggered: false,
      contribution: 0,
      severity: "NONE",
      reason:
        "IP address matches a previously observed successful authentication for this account.",
    };
  }

  return {
    type: "UNKNOWN_IP",
    triggered: true,
    contribution: config.weights.unknownIp,
    severity: "LOW",
    reason:
      "Authentication originated from an IP address not previously observed for this account. IP changes are common and do not imply a new geographic location.",
  };
}

export function evaluateRecentFailures(
  input: RiskEvaluationInput,
  config: RiskEngineConfig,
): RiskSignalResult {
  const w = config.weights.recentFailures;
  const short = Math.max(0, input.recentFailedAttemptsShort);
  const long = Math.max(0, input.recentFailedAttemptsLong);

  let contribution = w.shortNone;
  let severity: RiskSignalResult["severity"] = "NONE";
  let detail =
    "No failed authentication attempts were observed in the short time window.";

  if (short >= 1 && short <= w.shortLowMax) {
    contribution = w.shortLow;
    severity = "LOW";
    detail = `${short} failed authentication attempt(s) in the short time window.`;
  } else if (short > w.shortLowMax && short <= w.shortMediumMax) {
    contribution = w.shortMedium;
    severity = "MEDIUM";
    detail = `${short} failed authentication attempts in the short time window.`;
  } else if (short > w.shortMediumMax) {
    contribution = w.shortHigh;
    severity = "HIGH";
    detail = `${short} failed authentication attempts in the short time window (elevated).`;
  }

  if (long > short && long >= w.longBoostMax && contribution > 0) {
    contribution += w.longBoost;
    detail += ` Additional failures in the longer window (${long} total) increase pressure.`;
  }

  const triggered = contribution > 0;

  return {
    type: "RECENT_FAILURES",
    triggered,
    contribution,
    severity,
    reason: triggered
      ? `Repeated failed authentication attempts were observed within the configured time windows. ${detail}`
      : detail,
  };
}

export function evaluateRapidAttempts(
  input: RiskEvaluationInput,
  config: RiskEngineConfig,
): RiskSignalResult {
  const { minCount, contribution } = config.weights.rapidAttempts;
  const count = Math.max(0, input.rapidAttemptCount);

  if (count < minCount) {
    return {
      type: "RAPID_ATTEMPTS",
      triggered: false,
      contribution: 0,
      severity: "NONE",
      reason: `Authentication attempt rate (${count}) is within the normal window threshold.`,
    };
  }

  return {
    type: "RAPID_ATTEMPTS",
    triggered: true,
    contribution,
    severity: "MEDIUM",
    reason: `Unusually rapid authentication activity was observed (${count} attempts in the rapid window).`,
  };
}

export function evaluateNewCredential(
  input: RiskEvaluationInput,
  config: RiskEngineConfig,
): RiskSignalResult {
  const { maxAgeMs, contribution } = config.weights.newCredential;
  const firstUse = !input.isKnownCredential;
  const recentlyRegistered = input.credentialAgeMs <= maxAgeMs;

  if (!firstUse && !recentlyRegistered) {
    return {
      type: "NEW_CREDENTIAL",
      triggered: false,
      contribution: 0,
      severity: "NONE",
      reason: "Credential has an established successful authentication history.",
    };
  }

  return {
    type: "NEW_CREDENTIAL",
    triggered: true,
    contribution,
    severity: "LOW",
    reason: firstUse
      ? "Passkey credential has not successfully authenticated before (first use)."
      : "Passkey credential was registered recently and has limited authentication history.",
  };
}

export function evaluateNewAccount(
  input: RiskEvaluationInput,
  config: RiskEngineConfig,
): RiskSignalResult {
  const { maxAgeMs, contribution } = config.weights.newAccount;

  if (input.accountAgeMs > maxAgeMs) {
    return {
      type: "NEW_ACCOUNT",
      triggered: false,
      contribution: 0,
      severity: "NONE",
      reason: "Account has existed long enough to establish baseline history.",
    };
  }

  return {
    type: "NEW_ACCOUNT",
    triggered: true,
    contribution,
    severity: "LOW",
    reason:
      "Account was created recently and has limited historical authentication context. New accounts are not inherently malicious.",
  };
}

export function evaluateHighSessionCount(
  input: RiskEvaluationInput,
  config: RiskEngineConfig,
): RiskSignalResult {
  const { minCount, contribution } = config.weights.highSessionCount;
  const count = Math.max(0, input.activeSessionCount);

  if (count < minCount) {
    return {
      type: "HIGH_SESSION_COUNT",
      triggered: false,
      contribution: 0,
      severity: "NONE",
      reason: `Active session count (${count}) is within the expected range.`,
    };
  }

  return {
    type: "HIGH_SESSION_COUNT",
    triggered: true,
    contribution,
    severity: "LOW",
    reason: `Unusually high number of concurrent active sessions (${count}). Multiple devices are normal; elevated counts add context only.`,
  };
}

export function evaluateLongDormancy(
  input: RiskEvaluationInput,
  config: RiskEngineConfig,
): RiskSignalResult {
  const { minMs, contribution } = config.weights.longDormancy;
  const since = input.timeSinceLastSuccessfulLoginMs;

  if (since === null) {
    return {
      type: "LONG_DORMANCY",
      triggered: false,
      contribution: 0,
      severity: "NONE",
      reason: "No prior successful login exists; dormancy does not apply.",
    };
  }

  if (since < minMs) {
    return {
      type: "LONG_DORMANCY",
      triggered: false,
      contribution: 0,
      severity: "NONE",
      reason: "Account authenticated successfully within the recent activity window.",
    };
  }

  return {
    type: "LONG_DORMANCY",
    triggered: true,
    contribution,
    severity: "LOW",
    reason:
      "Account had no successful authentication for a long period before this attempt. Dormancy alone is not treated as malicious.",
  };
}

export function evaluateBaseSignals(
  input: RiskEvaluationInput,
  config: RiskEngineConfig,
): RiskSignalResult[] {
  return [
    evaluateUnknownUserAgent(input, config),
    evaluateUnknownIp(input, config),
    evaluateRecentFailures(input, config),
    evaluateRapidAttempts(input, config),
    evaluateNewCredential(input, config),
    evaluateNewAccount(input, config),
    evaluateHighSessionCount(input, config),
    evaluateLongDormancy(input, config),
  ];
}
