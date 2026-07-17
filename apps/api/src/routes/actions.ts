import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { assertTrustedOrigin, clientIp, clientUserAgent } from "../lib/request.js";
import {
  beginActionAuthorizationCeremony,
  cancelActionAuthorization,
  createDeleteApplicationAuthorization,
  executeActionAuthorization,
  getActionAuthorizationForActor,
  listActionAuthorizationsForUser,
  verifyActionAuthorization,
} from "../modules/actions/service.js";
import { ensureAuth, requireAuth } from "../plugins/auth.js";

const createSchema = z.object({
  actionType: z.literal("DELETE_APPLICATION"),
  targetId: z.string().uuid(),
});

function serializeAuthorization(row: {
  id: string;
  platformUserId: string;
  organizationId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  intentPayload: unknown;
  intentHash: string;
  displaySummary: unknown;
  status: string;
  riskAssessmentId: string | null;
  pendingExpiresAt: Date;
  executionExpiresAt: Date | null;
  authorizedAt: Date | null;
  executedAt: Date | null;
  cancelledAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  organization?: { id: string; name: string };
  platformUser?: { id: string; email: string; displayName: string };
  riskAssessment?: {
    id: string;
    score: number;
    level: string;
    recommendedDecision: string;
    enforcedDecision?: string;
    mode: string;
  } | null;
  events?: Array<{
    id: string;
    type: string;
    success: boolean;
    createdAt: Date;
    metadata: unknown;
  }>;
}) {
  return {
    id: row.id,
    platformUserId: row.platformUserId,
    organizationId: row.organizationId,
    actionType: row.actionType,
    targetType: row.targetType,
    targetId: row.targetId,
    intentPayload: row.intentPayload,
    intentHash: row.intentHash,
    displaySummary: row.displaySummary,
    status: row.status,
    riskAssessmentId: row.riskAssessmentId,
    pendingExpiresAt: row.pendingExpiresAt.toISOString(),
    executionExpiresAt: row.executionExpiresAt?.toISOString() ?? null,
    authorizedAt: row.authorizedAt?.toISOString() ?? null,
    executedAt: row.executedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    organization: row.organization,
    actor: row.platformUser,
    riskAssessment: row.riskAssessment
      ? {
          id: row.riskAssessment.id,
          score: row.riskAssessment.score,
          level: row.riskAssessment.level,
          recommendedDecision: row.riskAssessment.recommendedDecision,
          enforcedDecision: row.riskAssessment.enforcedDecision,
          mode: row.riskAssessment.mode,
        }
      : null,
    events: row.events?.map((e) => ({
      id: e.id,
      type: e.type,
      success: e.success,
      createdAt: e.createdAt.toISOString(),
      metadata: e.metadata,
    })),
  };
}

export function actionRoutes(env: Env): FastifyPluginAsync {
  return async (app) => {
    app.post(
      "/api/v1/actions/authorizations",
      { preHandler: requireAuth },
      async (request, reply) => {
        ensureAuth(request);
        assertTrustedOrigin(request, env.WEB_ORIGIN);
        const body = createSchema.parse(request.body);

        const authorization = await createDeleteApplicationAuthorization({
          env,
          actorId: request.auth.platformUserId,
          applicationId: body.targetId,
          ipAddress: clientIp(request),
          userAgent: clientUserAgent(request),
        });

        return reply.status(201).send({
          authorization: serializeAuthorization(authorization),
        });
      },
    );

    app.get(
      "/api/v1/actions/authorizations",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);
        const query = z
          .object({
            limit: z.coerce.number().int().min(1).max(100).default(50),
          })
          .parse(request.query);

        const rows = await listActionAuthorizationsForUser({
          actorId: request.auth.platformUserId,
          limit: query.limit,
        });

        return {
          authorizations: rows.map((row) => serializeAuthorization(row)),
        };
      },
    );

    app.get(
      "/api/v1/actions/authorizations/:id",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
        const row = await getActionAuthorizationForActor({
          id,
          actorId: request.auth.platformUserId,
        });
        return { authorization: serializeAuthorization(row) };
      },
    );

    app.post(
      "/api/v1/actions/authorizations/:id/options",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);
        assertTrustedOrigin(request, env.WEB_ORIGIN);
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

        const { options, authorization } = await beginActionAuthorizationCeremony({
          env,
          authorizationId: id,
          actorId: request.auth.platformUserId,
        });

        return {
          options,
          authorization: serializeAuthorization(authorization),
        };
      },
    );

    app.post(
      "/api/v1/actions/authorizations/:id/verify",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);
        assertTrustedOrigin(request, env.WEB_ORIGIN);
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

        const authorization = await verifyActionAuthorization({
          env,
          authorizationId: id,
          actorId: request.auth.platformUserId,
          response: request.body as never,
          ipAddress: clientIp(request),
          userAgent: clientUserAgent(request),
        });

        return { authorization: serializeAuthorization(authorization) };
      },
    );

    app.post(
      "/api/v1/actions/authorizations/:id/execute",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);
        assertTrustedOrigin(request, env.WEB_ORIGIN);
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

        // Execute uses ONLY the authorizationId — never client-resubmitted targets.
        const authorization = await executeActionAuthorization({
          authorizationId: id,
          actorId: request.auth.platformUserId,
          ipAddress: clientIp(request),
          userAgent: clientUserAgent(request),
        });

        return { authorization: serializeAuthorization(authorization) };
      },
    );

    app.post(
      "/api/v1/actions/authorizations/:id/cancel",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);
        assertTrustedOrigin(request, env.WEB_ORIGIN);
        const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

        const authorization = await cancelActionAuthorization({
          authorizationId: id,
          actorId: request.auth.platformUserId,
          ipAddress: clientIp(request),
          userAgent: clientUserAgent(request),
        });

        return { authorization: serializeAuthorization(authorization) };
      },
    );
  };
}
