/**
 * IP / User-Agent helpers for risk context.
 *
 * Production reverse proxies: configure Fastify `trustProxy` for known hops only.
 * Do NOT enable unrestricted trustProxy. Do NOT blindly trust X-Forwarded-For
 * from arbitrary clients — that header is ignored unless trustProxy is set.
 *
 * Local development typically sees 127.0.0.1 / ::1.
 */

/** Normalize IPv4-mapped IPv6 (::ffff:a.b.c.d → a.b.c.d) and trim. */
export function normalizeIpAddress(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim().toLowerCase();
  if (!trimmed) return null;

  const mapped = trimmed.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1]) {
    return mapped[1];
  }

  return trimmed;
}

/** Mask IPv4 last octet / truncate IPv6 for dashboard display. */
export function maskIpAddress(ip: string | null | undefined): string | null {
  const normalized = normalizeIpAddress(ip);
  if (!normalized) return null;

  if (normalized.includes(".")) {
    const parts = normalized.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  }

  if (normalized.includes(":")) {
    const parts = normalized.split(":");
    if (parts.length >= 2) {
      return `${parts.slice(0, 2).join(":")}:…`;
    }
  }

  return "xxx";
}

export function normalizeUserAgent(
  ua: string | null | undefined,
  maxLength = 512,
): string | null {
  if (!ua) return null;
  const trimmed = ua.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}
