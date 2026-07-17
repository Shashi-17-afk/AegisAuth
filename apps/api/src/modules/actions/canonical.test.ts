import { describe, expect, it } from "vitest";
import {
  CanonicalizationError,
  buildCanonicalActionIntent,
  canonicalize,
  serializeCanonical,
} from "./canonical.js";
import { hashActionIntentInput, hashCanonicalIntent } from "./hash.js";

describe("canonicalize", () => {
  it("sorts object keys deterministically", () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    expect(serializeCanonical(a)).toBe(serializeCanonical(b));
    expect(serializeCanonical(a)).toBe('{"a":2,"b":1}');
  });

  it("preserves array order", () => {
    expect(serializeCanonical(canonicalize([3, 1, 2]))).toBe("[3,1,2]");
  });

  it("rejects undefined", () => {
    expect(() => canonicalize(undefined)).toThrow(CanonicalizationError);
  });

  it("rejects undefined object properties", () => {
    expect(() => canonicalize({ a: undefined })).toThrow(CanonicalizationError);
  });

  it("rejects NaN", () => {
    expect(() => canonicalize(Number.NaN)).toThrow(CanonicalizationError);
  });

  it("rejects Infinity", () => {
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(
      CanonicalizationError,
    );
  });

  it("rejects functions", () => {
    expect(() => canonicalize({ fn: () => 1 })).toThrow(CanonicalizationError);
  });
});

describe("intent hashing", () => {
  const base = {
    actionType: "DELETE_APPLICATION",
    organizationId: "11111111-1111-1111-1111-111111111111",
    actorId: "22222222-2222-2222-2222-222222222222",
    targetType: "APPLICATION",
    targetId: "33333333-3333-3333-3333-333333333333",
    parameters: {},
  };

  it("same semantic intent with different key insertion order → same hash", () => {
    const intentA = buildCanonicalActionIntent(base);
    const intentB = buildCanonicalActionIntent({
      targetId: base.targetId,
      actorId: base.actorId,
      organizationId: base.organizationId,
      actionType: base.actionType,
      targetType: base.targetType,
      parameters: {},
    });
    expect(hashCanonicalIntent(intentA)).toBe(hashCanonicalIntent(intentB));
  });

  it("different target → different hash", () => {
    const a = hashActionIntentInput(base);
    const b = hashActionIntentInput({
      ...base,
      targetId: "44444444-4444-4444-4444-444444444444",
    });
    expect(a.intentHash).not.toBe(b.intentHash);
  });

  it("different actor → different hash", () => {
    const a = hashActionIntentInput(base);
    const b = hashActionIntentInput({
      ...base,
      actorId: "55555555-5555-5555-5555-555555555555",
    });
    expect(a.intentHash).not.toBe(b.intentHash);
  });

  it("different organization → different hash", () => {
    const a = hashActionIntentInput(base);
    const b = hashActionIntentInput({
      ...base,
      organizationId: "66666666-6666-6666-6666-666666666666",
    });
    expect(a.intentHash).not.toBe(b.intentHash);
  });

  it("different parameter → different hash", () => {
    const a = hashActionIntentInput(base);
    const b = hashActionIntentInput({
      ...base,
      parameters: { note: "x" },
    });
    expect(a.intentHash).not.toBe(b.intentHash);
  });
});
