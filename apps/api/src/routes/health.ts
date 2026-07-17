import type { FastifyInstance } from "fastify";
import type { HealthResponse } from "@aegisauth/shared";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      service: "aegisauth-api",
      timestamp: new Date().toISOString(),
    };
  });
}
