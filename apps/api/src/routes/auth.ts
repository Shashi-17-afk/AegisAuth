import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@aegisauth/database";
import type { Env } from "../config/env.js";
import { AppError, isAppError } from "../lib/errors.js";
import { assertTrustedOrigin, clientIp, clientUserAgent } from "../lib/request.js";
import { beginAuthentication, completeAuthentication } from "../modules/auth/login.js";
import { beginRegistration, completeRegistration } from "../modules/auth/register.js";
import {
  clearSessionCookie,
  createSession,
  revokeSession,
  SESSION_COOKIE_NAME,
} from "../modules/auth/session.js";
import { ensureAuth, requireAuth } from "../plugins/auth.js";

const registerOptionsSchema = z.object({
  email: z.string().email().max(320),
  displayName: z.string().min(1).max(120),
  organizationName: z.string().min(1).max(120),
});

const webauthnResponseSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal("public-key"),
  response: z.record(z.unknown()),
  clientExtensionResults: z.record(z.unknown()).optional(),
  authenticatorAttachment: z.string().optional(),
});

export function authRoutes(env: Env): FastifyPluginAsync {
  return async (app) => {
    const authLimit = {
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_MAX,
          timeWindow: env.RATE_LIMIT_TIME_WINDOW_MS,
        },
      },
    };

    app.post("/api/v1/auth/register/options", authLimit, async (request, reply) => {
      assertTrustedOrigin(request, env.WEB_ORIGIN);
      const body = registerOptionsSchema.parse(request.body);
      const options = await beginRegistration({
        env,
        email: body.email,
        displayName: body.displayName,
        organizationName: body.organizationName,
      });
      return reply.send(options);
    });

    app.post("/api/v1/auth/register/verify", authLimit, async (request, reply) => {
      assertTrustedOrigin(request, env.WEB_ORIGIN);
      const body = webauthnResponseSchema.parse(request.body);
      const result = await completeRegistration({
        env,
        response: body as never,
        reply,
        ipAddress: clientIp(request),
        userAgent: clientUserAgent(request),
      });
      return reply.send({ ok: true, ...result });
    });

    app.post("/api/v1/auth/login/options", authLimit, async (request, reply) => {
      assertTrustedOrigin(request, env.WEB_ORIGIN);
      const options = await beginAuthentication({ env });
      return reply.send(options);
    });

    app.post("/api/v1/auth/login/verify", authLimit, async (request, reply) => {
      assertTrustedOrigin(request, env.WEB_ORIGIN);
      const body = webauthnResponseSchema.parse(request.body);
      const result = await completeAuthentication({
        env,
        response: body as never,
        reply,
        ipAddress: clientIp(request),
        userAgent: clientUserAgent(request),
      });
      return reply.send({ ok: true, ...result });
    });

    app.post(
      "/api/v1/auth/logout",
      { preHandler: requireAuth },
      async (request, reply) => {
        assertTrustedOrigin(request, env.WEB_ORIGIN);
        ensureAuth(request);
        await revokeSession({
          sessionId: request.auth.sessionId,
          platformUserId: request.auth.platformUserId,
          ipAddress: clientIp(request),
          userAgent: clientUserAgent(request),
        });
        await clearSessionCookie(reply, env);
        return reply.send({ ok: true });
      },
    );

    app.get(
      "/api/v1/auth/me",
      { preHandler: requireAuth },
      async (request, reply) => {
        ensureAuth(request);

        const memberships = await prisma.organizationMember.findMany({
          where: { platformUserId: request.auth.platformUserId },
          include: {
            organization: {
              select: { id: true, name: true, slug: true },
            },
          },
          orderBy: { createdAt: "asc" },
        });

        return reply.send({
          user: {
            id: request.auth.platformUserId,
            email: request.auth.email,
            displayName: request.auth.displayName,
          },
          organizations: memberships.map((m) => ({
            id: m.organization.id,
            name: m.organization.name,
            slug: m.organization.slug,
            role: m.role,
          })),
          sessionId: request.auth.sessionId,
        });
      },
    );

    app.get(
      "/api/v1/auth/sessions",
      { preHandler: requireAuth },
      async (request, reply) => {
        ensureAuth(request);
        const sessions = await prisma.session.findMany({
          where: {
            platformUserId: request.auth.platformUserId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { lastUsedAt: "desc" },
          select: {
            id: true,
            createdAt: true,
            lastUsedAt: true,
            expiresAt: true,
            userAgent: true,
            ipAddress: true,
          },
        });

        return reply.send({
          sessions: sessions.map((s) => ({
            ...s,
            current: s.id === request.auth!.sessionId,
          })),
        });
      },
    );

    app.delete(
      "/api/v1/auth/sessions/:sessionId",
      { preHandler: requireAuth },
      async (request, reply) => {
        assertTrustedOrigin(request, env.WEB_ORIGIN);
        ensureAuth(request);
        const params = z.object({ sessionId: z.string().uuid() }).parse(request.params);

        await revokeSession({
          sessionId: params.sessionId,
          platformUserId: request.auth.platformUserId,
          ipAddress: clientIp(request),
          userAgent: clientUserAgent(request),
        });

        if (params.sessionId === request.auth.sessionId) {
          await clearSessionCookie(reply, env);
        }

        return reply.send({ ok: true, revokedCurrent: params.sessionId === request.auth.sessionId });
      },
    );

    app.get(
      "/api/v1/auth/passkeys",
      { preHandler: requireAuth },
      async (request, reply) => {
        ensureAuth(request);
        const passkeys = await prisma.passkeyCredential.findMany({
          where: { platformUserId: request.auth.platformUserId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            deviceType: true,
            backedUp: true,
            friendlyName: true,
            createdAt: true,
            lastUsedAt: true,
            transports: true,
          },
        });
        return reply.send({ passkeys });
      },
    );

    // Intentionally no passkey DELETE in Phase 2 — recovery is not implemented.
    // Deleting the final passkey would lock the account.

    /**
     * Development/test-only: establish a real HttpOnly session without WebAuthn.
     * Used to prove Set-Cookie forwarding through the Next.js proxy.
     * Disabled in production.
     */
    if (env.NODE_ENV !== "production") {
      app.post("/api/v1/auth/dev/session-probe", async (request, reply) => {
        assertTrustedOrigin(request, env.WEB_ORIGIN);
        const user = await prisma.platformUser.findFirst({
          orderBy: { createdAt: "desc" },
        });
        if (!user) {
          throw new AppError(404, "NO_USER", "No platform user available for probe");
        }
        await createSession({
          env,
          platformUserId: user.id,
          reply,
          ipAddress: clientIp(request),
          userAgent: clientUserAgent(request),
        });
        return reply.send({ ok: true, platformUserId: user.id });
      });
    }

    void SESSION_COOKIE_NAME;
  };
}

export function mapAuthError(error: unknown): { statusCode: number; body: object } {
  if (error instanceof z.ZodError) {
    return {
      statusCode: 400,
      body: {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        statusCode: 400,
      },
    };
  }
  if (isAppError(error)) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      },
    };
  }
  return {
    statusCode: 500,
    body: {
      error: "Internal Server Error",
      code: "INTERNAL_ERROR",
      statusCode: 500,
    },
  };
}
