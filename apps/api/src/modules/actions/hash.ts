import { createHash } from "node:crypto";
import {
  buildCanonicalActionIntent,
  serializeCanonical,
  type CanonicalActionIntent,
  type JsonValue,
  canonicalize,
} from "./canonical.js";

/** SHA-256 hex digest of the canonical serialized intent. */
export function hashCanonicalIntent(intent: CanonicalActionIntent): string {
  const canonical = canonicalize(intent) as CanonicalActionIntent;
  const serialized = serializeCanonical(canonical);
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

export function hashActionIntentInput(input: {
  actionType: string;
  organizationId: string;
  actorId: string;
  targetType: string;
  targetId: string;
  parameters?: Record<string, unknown>;
}): { intent: CanonicalActionIntent; intentHash: string; serialized: string } {
  const intent = buildCanonicalActionIntent(input);
  const serialized = serializeCanonical(intent);
  const intentHash = createHash("sha256").update(serialized, "utf8").digest("hex");
  return { intent, intentHash, serialized };
}

/** Re-hash a stored payload and compare to the expected hash (timing-safe via length+equal). */
export function verifyStoredIntentHash(
  storedPayload: unknown,
  expectedHash: string,
): boolean {
  try {
    const canonical = canonicalize(storedPayload) as JsonValue;
    const serialized = serializeCanonical(canonical);
    const actual = createHash("sha256").update(serialized, "utf8").digest("hex");
    return actual === expectedHash;
  } catch {
    return false;
  }
}
