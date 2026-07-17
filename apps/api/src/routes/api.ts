import type { FastifyInstance } from "fastify";
import type { ApiInfoResponse } from "@aegisauth/shared";

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1", async (): Promise<ApiInfoResponse> => {
    return {
      name: "AegisAuth API",
      version: "v1",
      status: "operational",
    };
  });
}
