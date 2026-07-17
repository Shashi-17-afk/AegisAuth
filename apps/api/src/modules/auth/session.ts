import { prisma } from "@aegisauth/database";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../../config/env.js";
import { generateSessionToken, hashSessionToken } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";
import { recordAuthEvent } from "./events.js";

export const SESSION_COOKIE_NAME = "aegis_session";

export async function createSession(input: {
  env: Env;
  platformUserId: string;
  reply: FastifyReply;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<{ sessionId: string }> {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + input.env.SESSION_TTL_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      platformUserId: input.platformUserId,
      tokenHash,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });

  input.reply.setCookie(SESSION_COOKIE_NAME, rawToken, {
    path: "/",
    httpOnly: true,
    // Secure in production — localhost HTTP requires Secure=false for the cookie to stick.
    secure: input.env.NODE_ENV === "production",
    // Lax is correct for first-party cookies. Browser traffic must hit the API via the
    // Next.js same-origin rewrite (/api → Fastify); cross-origin Set-Cookie from :3001
    // to a page on :3000 is dropped by Chromium, which caused verify=200 then /me=401.
    sameSite: "lax",
    expires: expiresAt,
  });

  await recordAuthEvent({
    type: "SESSION_CREATED",
    success: true,
    platformUserId: input.platformUserId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: { sessionId: session.id },
  });

  return { sessionId: session.id };
}

export async function revokeSession(input: {
  sessionId: string;
  platformUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const result = await prisma.session.updateMany({
    where: {
      id: input.sessionId,
      platformUserId: input.platformUserId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Session not found");
  }

  await recordAuthEvent({
    type: "SESSION_REVOKED",
    success: true,
    platformUserId: input.platformUserId,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: { sessionId: input.sessionId },
  });
}

export async function clearSessionCookie(
  reply: FastifyReply,
  env: Env,
): Promise<void> {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

export type AuthenticatedContext = {
  platformUserId: string;
  sessionId: string;
  email: string;
  displayName: string;
};

export async function resolveSessionFromRequest(
  request: FastifyRequest,
): Promise<AuthenticatedContext | null> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      platformUser: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.revokedAt) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    return null;
  }

  // Touch lastUsedAt without blocking the request critically on failure.
  void prisma.session
    .update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return {
    platformUserId: session.platformUser.id,
    sessionId: session.id,
    email: session.platformUser.email,
    displayName: session.platformUser.displayName,
  };
}
