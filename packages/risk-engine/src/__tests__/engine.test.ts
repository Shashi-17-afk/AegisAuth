import { describe, expect, it } from "vitest";
import {
  DEFAULT_RISK_CONFIG,
  evaluateRisk,
  levelToRecommendedDecision,
  scoreToLevel,
  shouldEnforceDeny,
  type RiskEvaluationInput,
} from "../index.js";

function baseInput(
  overrides: Partial<RiskEvaluationInput> = {},
): RiskEvaluationInput {
  return {
    evaluatedAt: new Date("2026-07-18T00:00:00.000Z"),
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

describe("evaluateRisk — baseline", () => {
  it("no suspicious signals → LOW / ALLOW", () => {
    const result = evaluateRisk(baseInput());
    expect(result.score).toBe(0);
    expect(result.level).toBe("LOW");
    expect(result.recommendedDecision).toBe("ALLOW");
    expect(result.reasons).toEqual([]);
    expect(result.signals.every((s) => !s.triggered || s.contribution === 0)).toBe(
      true,
    );
  });

  it("is deterministic for the same input", () => {
    const input = baseInput({
      isKnownIpAddress: false,
      isKnownUserAgent: false,
      recentFailedAttemptsShort: 4,
    });
    const a = evaluateRisk(input);
    const b = evaluateRisk(input);
    expect(a).toEqual(b);
  });
});

describe("evaluateRisk — weak single signals", () => {
  it("new User-Agent alone does not become HIGH", () => {
    const result = evaluateRisk(baseInput({ isKnownUserAgent: false }));
    expect(result.score).toBe(DEFAULT_RISK_CONFIG.weights.unknownUserAgent);
    expect(result.level).toBe("LOW");
    expect(result.level).not.toBe("HIGH");
    expect(result.level).not.toBe("CRITICAL");
  });

  it("new IP alone does not become HIGH", () => {
    const result = evaluateRisk(baseInput({ isKnownIpAddress: false }));
    expect(result.score).toBe(DEFAULT_RISK_CONFIG.weights.unknownIp);
    expect(result.level).toBe("LOW");
    expect(result.level).not.toBe("HIGH");
  });

  it("recent failures increase score", () => {
    const none = evaluateRisk(baseInput());
    const some = evaluateRisk(baseInput({ recentFailedAttemptsShort: 2 }));
    expect(some.score).toBeGreaterThan(none.score);
    expect(some.score).toBe(DEFAULT_RISK_CONFIG.weights.recentFailures.shortLow);
  });

  it("large failure burst increases score more", () => {
    const small = evaluateRisk(baseInput({ recentFailedAttemptsShort: 2 }));
    const large = evaluateRisk(baseInput({ recentFailedAttemptsShort: 8 }));
    expect(large.score).toBeGreaterThan(small.score);
    expect(large.score).toBe(DEFAULT_RISK_CONFIG.weights.recentFailures.shortHigh);
  });

  it("rapid attempts increase score", () => {
    const result = evaluateRisk(baseInput({ rapidAttemptCount: 5 }));
    expect(result.score).toBe(DEFAULT_RISK_CONFIG.weights.rapidAttempts.contribution);
    expect(
      result.signals.find((s) => s.type === "RAPID_ATTEMPTS")?.triggered,
    ).toBe(true);
  });

  it("new credential contributes limited risk", () => {
    const result = evaluateRisk(
      baseInput({ isKnownCredential: false, credentialAgeMs: 60_000 }),
    );
    expect(result.score).toBe(DEFAULT_RISK_CONFIG.weights.newCredential.contribution);
    expect(result.level).toBe("LOW");
  });

  it("new account contributes limited risk", () => {
    const result = evaluateRisk(baseInput({ accountAgeMs: 60 * 60 * 1000 }));
    expect(result.score).toBe(DEFAULT_RISK_CONFIG.weights.newAccount.contribution);
    expect(result.level).toBe("LOW");
  });

  it("high session count contributes only above threshold", () => {
    const normal = evaluateRisk(baseInput({ activeSessionCount: 3 }));
    const high = evaluateRisk(baseInput({ activeSessionCount: 6 }));
    expect(normal.score).toBe(0);
    expect(high.score).toBe(
      DEFAULT_RISK_CONFIG.weights.highSessionCount.contribution,
    );
  });

  it("dormancy contributes limited risk", () => {
    const result = evaluateRisk(
      baseInput({
        timeSinceLastSuccessfulLoginMs: 100 * 24 * 60 * 60 * 1000,
      }),
    );
    expect(result.score).toBe(DEFAULT_RISK_CONFIG.weights.longDormancy.contribution);
    expect(result.level).toBe("LOW");
  });
});

describe("evaluateRisk — compounds", () => {
  it("compound new IP + new User-Agent increases score", () => {
    const uaOnly = evaluateRisk(baseInput({ isKnownUserAgent: false }));
    const both = evaluateRisk(
      baseInput({ isKnownUserAgent: false, isKnownIpAddress: false }),
    );
    expect(both.score).toBeGreaterThan(uaOnly.score);
    expect(both.score).toBe(
      DEFAULT_RISK_CONFIG.weights.unknownUserAgent +
        DEFAULT_RISK_CONFIG.weights.unknownIp +
        DEFAULT_RISK_CONFIG.weights.compoundNewContext,
    );
    expect(
      both.signals.some((s) => s.type === "COMPOUND_NEW_CONTEXT" && s.triggered),
    ).toBe(true);
  });

  it("compound new IP + UA + failures increases more", () => {
    const context = evaluateRisk(
      baseInput({ isKnownUserAgent: false, isKnownIpAddress: false }),
    );
    const withFailures = evaluateRisk(
      baseInput({
        isKnownUserAgent: false,
        isKnownIpAddress: false,
        recentFailedAttemptsShort: 4,
      }),
    );
    expect(withFailures.score).toBeGreaterThan(context.score);
    expect(
      withFailures.signals.some(
        (s) => s.type === "COMPOUND_NEW_CONTEXT_WITH_FAILURES" && s.triggered,
      ),
    ).toBe(true);
    expect(
      withFailures.signals.some((s) => s.type === "COMPOUND_NEW_CONTEXT"),
    ).toBe(false);
  });
});

describe("evaluateRisk — score bounds and levels", () => {
  it("clamps score at 100", () => {
    const result = evaluateRisk(
      baseInput({
        isKnownUserAgent: false,
        isKnownIpAddress: false,
        recentFailedAttemptsShort: 20,
        recentFailedAttemptsLong: 30,
        rapidAttemptCount: 20,
        isKnownCredential: false,
        accountAgeMs: 1000,
        activeSessionCount: 20,
        timeSinceLastSuccessfulLoginMs: 200 * 24 * 60 * 60 * 1000,
        credentialAgeMs: 1000,
      }),
    );
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBe(100);
  });

  it("never goes below 0", () => {
    const result = evaluateRisk(baseInput());
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("maps LOW / MEDIUM / HIGH / CRITICAL correctly", () => {
    expect(scoreToLevel(0)).toBe("LOW");
    expect(scoreToLevel(24)).toBe("LOW");
    expect(scoreToLevel(25)).toBe("MEDIUM");
    expect(scoreToLevel(49)).toBe("MEDIUM");
    expect(scoreToLevel(50)).toBe("HIGH");
    expect(scoreToLevel(74)).toBe("HIGH");
    expect(scoreToLevel(75)).toBe("CRITICAL");
    expect(scoreToLevel(100)).toBe("CRITICAL");
  });

  it("maps recommended decisions correctly", () => {
    expect(levelToRecommendedDecision("LOW", 10)).toBe("ALLOW");
    expect(levelToRecommendedDecision("MEDIUM", 30)).toBe("ALLOW");
    expect(levelToRecommendedDecision("MEDIUM", 35)).toBe("STEP_UP");
    expect(levelToRecommendedDecision("HIGH", 60)).toBe("STEP_UP");
    expect(levelToRecommendedDecision("CRITICAL", 90)).toBe("DENY");
  });
});

describe("observe mode", () => {
  it("does not block authentication even when recommended DENY", () => {
    expect(
      shouldEnforceDeny({
        recommendedDecision: "DENY",
        mode: "OBSERVE",
      }),
    ).toBe(false);
  });

  it("ENFORCE mode would block on DENY (scaffold only)", () => {
    expect(
      shouldEnforceDeny({
        recommendedDecision: "DENY",
        mode: "ENFORCE",
      }),
    ).toBe(true);
    expect(
      shouldEnforceDeny({
        recommendedDecision: "STEP_UP",
        mode: "ENFORCE",
      }),
    ).toBe(false);
  });

  it("result mode comes from config (default OBSERVE)", () => {
    const result = evaluateRisk(baseInput());
    expect(result.mode).toBe("OBSERVE");
  });
});

describe("explainability", () => {
  it("generates reasons for triggered signals", () => {
    const result = evaluateRisk(
      baseInput({ isKnownIpAddress: false, isKnownUserAgent: false }),
    );
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some((r) => r.includes("UNKNOWN_IP"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("UNKNOWN_USER_AGENT"))).toBe(
      true,
    );
  });

  it("non-triggered signals do not produce misleading reason entries", () => {
    const result = evaluateRisk(baseInput());
    expect(result.reasons).toEqual([]);
    const knownIp = result.signals.find((s) => s.type === "UNKNOWN_IP");
    expect(knownIp?.triggered).toBe(false);
    expect(knownIp?.reason.toLowerCase()).toContain("previously observed");
  });
});
