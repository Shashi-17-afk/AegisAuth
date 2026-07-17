import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin API proxy to Fastify.
 *
 * Next.js `rewrites()` to an external upstream can drop `Set-Cookie` (forbidden
 * response header under fetch semantics). This Route Handler explicitly forwards
 * Cookie → upstream and Set-Cookie → browser via `headers.getSetCookie()`.
 *
 * Only proxies to the configured AegisAuth API base (not an open proxy).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function upstreamBase(): string {
  return (
    process.env.API_REWRITE_TARGET ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

function buildUpstreamUrl(req: NextRequest, pathSegments: string[]): string {
  const path = pathSegments.map(encodeURIComponent).join("/");
  return `${upstreamBase()}/api/${path}${req.nextUrl.search}`;
}

async function proxyRequest(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const upstreamUrl = buildUpstreamUrl(req, path);
  const headers = new Headers();

  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "set-cookie") return;
    headers.set(key, value);
  });

  // Ensure Origin for Fastify CSRF/origin checks matches the browser page.
  if (!headers.has("origin") && req.nextUrl.origin) {
    headers.set("origin", req.nextUrl.origin);
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "set-cookie") return;
    // Avoid leaking upstream CORS onto same-origin browser responses.
    if (lower.startsWith("access-control-")) return;
    responseHeaders.set(key, value);
  });

  // Critical: preserve session cookies. `get('set-cookie')` is unreliable.
  const setCookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];

  for (const cookie of setCookies) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxyRequest(req, ctx);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxyRequest(req, ctx);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxyRequest(req, ctx);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxyRequest(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxyRequest(req, ctx);
}
export async function OPTIONS(req: NextRequest, ctx: Ctx) {
  return proxyRequest(req, ctx);
}
export async function HEAD(req: NextRequest, ctx: Ctx) {
  return proxyRequest(req, ctx);
}
