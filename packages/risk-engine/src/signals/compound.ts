import type { RiskEngineConfig, RiskSignalResult } from "../types.js";

/**
 * Compound rules (deliberate, few):
 * 1. Unknown UA + unknown IP → small additional contribution
 * 2. Unknown UA + unknown IP + recent failures → stronger contribution
 */
export function evaluateCompoundSignals(
  base: RiskSignalResult[],
  config: RiskEngineConfig,
): RiskSignalResult[] {
  const byType = new Map(base.map((s) => [s.type, s]));
  const unknownUa = byType.get("UNKNOWN_USER_AGENT")?.triggered === true;
  const unknownIp = byType.get("UNKNOWN_IP")?.triggered === true;
  const failures = byType.get("RECENT_FAILURES")?.triggered === true;

  const compounds: RiskSignalResult[] = [];

  if (unknownUa && unknownIp && failures) {
    compounds.push({
      type: "COMPOUND_NEW_CONTEXT_WITH_FAILURES",
      triggered: true,
      contribution: config.weights.compoundNewContextWithFailures,
      severity: "HIGH",
      reason:
        "Compound anomaly: new browser/device profile and new IP address following recent failed authentication attempts.",
    });
  } else if (unknownUa && unknownIp) {
    compounds.push({
      type: "COMPOUND_NEW_CONTEXT",
      triggered: true,
      contribution: config.weights.compoundNewContext,
      severity: "MEDIUM",
      reason:
        "Compound anomaly: authentication combined a previously unseen browser/device profile with a previously unseen IP address.",
    });
  }

  return compounds;
}
