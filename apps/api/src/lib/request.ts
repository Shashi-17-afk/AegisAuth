import type { FastifyRequest } from "fastify";
import { AppError } from "./errors.js";
import { normalizeIpAddress, normalizeUserAgent } from "./net.js";

/**
 * Client IP for sessions / risk.
 *
 * Uses Fastify's `request.ip`, which respects `trustProxy` when configured.
 * Does NOT read X-Forwarded-For directly — that would allow client spoofing
 * unless the proxy chain is trusted via Fastify trustProxy.
 *
 * Local: typically 127.0.0.1.
 * Production: set trustProxy to known reverse-proxy hop count / addresses.
 */
export function clientIp(request: FastifyRequest): string | null {
  return normalizeIpAddress(request.ip);
}

export function clientUserAgent(request: FastifyRequest): string | null {
  const ua = request.headers["user-agent"];
  return typeof ua === "string" ? normalizeUserAgent(ua) : null;
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
