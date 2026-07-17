import type { FastifyRequest } from "fastify";
import { AppError } from "./errors.js";

export function clientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return request.ip ?? null;
}

export function clientUserAgent(request: FastifyRequest): string | null {
  const ua = request.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 512) : null;
}

/**
 * Origin check for credentialed cross-origin browser requests.
 * Rejects state-changing requests whose Origin does not match WEB_ORIGIN.
 * SameSite=Lax cookies reduce CSRF risk; this is defense-in-depth.
 *
 * Browser credentialed cross-origin POSTs always send Origin.
 * Non-browser clients (tests/curl) may omit Origin — those are allowed.
 */
export function assertTrustedOrigin(
  request: FastifyRequest,
  allowedOrigin: string,
): void {
  const origin = request.headers.origin;
  if (!origin) {
    return;
  }
  if (origin !== allowedOrigin) {
    throw new AppError(403, "ORIGIN_MISMATCH", "Request origin is not allowed");
  }
}
