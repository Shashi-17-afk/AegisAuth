import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { Env } from "./config/env.js";
import { isAppError } from "./lib/errors.js";
import { registerSessionAuth } from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { apiRoutes } from "./routes/api.js";
import { authRoutes } from "./routes/auth.js";

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  // Restrict CORS to the trusted web origin — never allow "*" with credentials.
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });

  await app.register(helmet, {
    global: true,
  });

  await app.register(cookie);

  /**
   * In-memory rate limiting — fine for local Phase 2 / single-instance.
   * Horizontally scaled production needs a shared store (e.g. Redis) — deferred.
   */
  await app.register(rateLimit, {
    global: false,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_TIME_WINDOW_MS,
  });

  // Root-level session hook (must not be encapsulated away from route plugins).
  registerSessionAuth(app);

  await app.register(healthRoutes);
  await app.register(apiRoutes);
  await app.register(authRoutes(env));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      void reply.status(400).send({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
      return;
    }

    if (isAppError(error)) {
      void reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      });
      return;
    }

    app.log.error(error);

    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;

    const message =
      error instanceof Error ? error.message : "Unexpected error";

    void reply.status(statusCode).send({
      error: statusCode >= 500 ? "Internal Server Error" : message,
      code: statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
      statusCode,
    });
  });

  return app;
}
