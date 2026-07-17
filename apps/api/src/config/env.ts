import { z } from "zod";

/**
 * Fail fast on invalid configuration.
 * Secrets stay server-side; WEB_ORIGIN / WEBAUTHN_ORIGIN are allowlists (never "*").
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z
    .string()
    .url()
    .refine((value) => value !== "*", {
      message: "WEB_ORIGIN must be an explicit origin; unrestricted CORS is not allowed",
    }),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),

  WEBAUTHN_RP_NAME: z.string().min(1).default("AegisAuth"),
  /** Effective domain for WebAuthn RP ID (e.g. localhost or aegisauth.example). */
  WEBAUTHN_RP_ID: z.string().min(1).default("localhost"),
  /** Expected browser origin for WebAuthn ceremonies (must match the web app). */
  WEBAUTHN_ORIGIN: z
    .string()
    .url()
    .refine((value) => value !== "*", {
      message: "WEBAUTHN_ORIGIN must be an explicit origin",
    }),

  /** Session lifetime in seconds (default 7 days). */
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  /** WebAuthn challenge lifetime in seconds (default 5 minutes). */
  WEBAUTHN_CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  /**
   * Risk engine mode.
   * observe (default): calculate + store + display; never block valid WebAuthn.
   * enforce: scaffolded only — Phase 3 must remain observe unless explicitly enabled later.
   */
  RISK_MODE: z.enum(["observe", "enforce"]).default("observe"),

  /**
   * How long a PENDING action authorization may wait for passkey verification.
   * Default 5 minutes. Bounds: 60s–3600s.
   */
  ACTION_AUTH_PENDING_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(300),
  /**
   * How long an AUTHORIZED grant may wait before execute.
   * Default 5 minutes from authorizedAt. Bounds: 60s–3600s.
   * Separate from pending TTL so verify and execute windows are explicit.
   */
  ACTION_AUTH_EXECUTION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(300),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_TIME_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}
