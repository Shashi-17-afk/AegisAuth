import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import { AppError } from "../lib/errors.js";
import {
  resolveSessionFromRequest,
  type AuthenticatedContext,
} from "../modules/auth/session.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthenticatedContext | null;
  }
}

/**
 * Attach session resolution at the ROOT Fastify instance.
 *
 * Important: do not register this hook inside an encapsulated plugin without
 * fastify-plugin. Encapsulated preHandlers do not run for sibling route plugins,
 * which left request.auth null on /auth/me after successful login/register.
 */
export function registerSessionAuth(app: FastifyInstance): void {
  app.decorateRequest("auth", null);

  app.addHook("preHandler", async (request) => {
    request.auth = await resolveSessionFromRequest(request);
  });
}

/** @deprecated Use registerSessionAuth at root — kept name for import clarity. */
export async function sessionPlugin(app: FastifyInstance): Promise<void> {
  registerSessionAuth(app);
}

export const requireAuth: preHandlerHookHandler = async (request) => {
  if (!request.auth) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  }
};

export type AuthedRequest = FastifyRequest & {
  auth: AuthenticatedContext;
};

export function ensureAuth(
  request: FastifyRequest,
): asserts request is AuthedRequest {
  if (!request.auth) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  }
}

export type { FastifyReply };
