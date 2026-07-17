import { z } from "zod";

/** GET /health */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("aegisauth-api"),
  timestamp: z.string().datetime().optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** GET /api/v1 */
export const apiInfoResponseSchema = z.object({
  name: z.literal("AegisAuth API"),
  version: z.literal("v1"),
  status: z.literal("operational"),
});

export type ApiInfoResponse = z.infer<typeof apiInfoResponseSchema>;
