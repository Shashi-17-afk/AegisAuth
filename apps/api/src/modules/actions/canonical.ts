/**
 * Deterministic canonicalization for action intents.
 * Do NOT use JSON.stringify on arbitrary objects — key order and value forms must be controlled.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export class CanonicalizationError extends Error {
  readonly code = "CANONICALIZATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "CanonicalizationError";
  }
}

function assertFiniteNumber(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    throw new CanonicalizationError("Numbers must be finite (NaN/Infinity rejected)");
  }
  return value;
}

/**
 * Recursively normalize a value into a JSON-safe structure with sorted object keys.
 * Arrays preserve order. Rejects undefined, functions, symbols, bigint, Date, etc.
 */
export function canonicalize(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }

  const t = typeof value;

  if (t === "string" || t === "boolean") {
    return value as JsonPrimitive;
  }

  if (t === "number") {
    return assertFiniteNumber(value as number);
  }

  if (t === "undefined") {
    throw new CanonicalizationError("undefined is not allowed in canonical intent");
  }

  if (t === "function" || t === "symbol" || t === "bigint") {
    throw new CanonicalizationError(`${t} values are not allowed in canonical intent`);
  }

  if (value instanceof Date) {
    throw new CanonicalizationError("Date objects are not allowed; use ISO strings");
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: JsonObject = {};
    for (const key of keys) {
      const entry = obj[key];
      if (entry === undefined) {
        throw new CanonicalizationError(
          `undefined property "${key}" is not allowed in canonical intent`,
        );
      }
      out[key] = canonicalize(entry);
    }
    return out;
  }

  throw new CanonicalizationError("Unsupported value type in canonical intent");
}

/** Stable JSON serialization of a canonicalized value (sorted keys already applied). */
export function serializeCanonical(value: JsonValue): string {
  return JSON.stringify(value);
}

export type CanonicalActionIntent = {
  version: 1;
  actionType: string;
  organizationId: string;
  actorId: string;
  target: {
    type: string;
    id: string;
  };
  parameters: JsonObject;
};

export function buildCanonicalActionIntent(input: {
  actionType: string;
  organizationId: string;
  actorId: string;
  targetType: string;
  targetId: string;
  parameters?: Record<string, unknown>;
}): CanonicalActionIntent {
  const parameters = (canonicalize(input.parameters ?? {}) as JsonObject) ?? {};

  const intent = canonicalize({
    version: 1,
    actionType: input.actionType,
    organizationId: input.organizationId,
    actorId: input.actorId,
    target: {
      type: input.targetType,
      id: input.targetId,
    },
    parameters,
  }) as CanonicalActionIntent;

  return intent;
}
