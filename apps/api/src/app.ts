import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import type { Env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { apiRoutes } from "./routes/api.js";

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  // Restrict CORS to the trusted web origin — never allow "*" in this security-sensitive API.
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });

  await app.register(helmet, {
    global: true,
  });

  app.setErrorHandler((error, _request, reply) => {
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
      statusCode,
    });
  });

  await app.register(healthRoutes);
  await app.register(apiRoutes);

  return app;
}
