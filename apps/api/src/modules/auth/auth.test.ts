import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@aegisauth/database";
import { generateSessionToken, hashSessionToken, uuidToBytes } from "../../lib/crypto.js";
import { normalizeEmail, slugify } from "../../lib/strings.js";
import { consumeChallenge, storeChallenge } from "./challenges.js";
import { loadEnv } from "../../config/env.js";
import { buildApp } from "../../app.js";
import { AppError } from "../../lib/errors.js";

describe("crypto", () => {
  it("hashes session tokens with SHA-256 and never equals the raw token", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toEqual(token);
    expect(hash).toEqual(createHash("sha256").update(token, "utf8").digest("hex"));
  });

  it("converts UUID to 16 bytes", () => {
    const bytes = uuidToBytes("550e8400-e29b-41d4-a716-446655440000");
    expect(bytes).toHaveLength(16);
  });
});

describe("strings", () => {
  it("normalizes email to lowercase", () => {
    expect(normalizeEmail("  Alex@Example.COM ")).toBe("alex@example.com");
  });

  it("slugifies organization names", () => {
    expect(slugify("Acme Security!")).toBe("acme-security");
  });
});

describe("WebAuthn challenge lifecycle", () => {
  const challenges: string[] = [];

  afterAll(async () => {
    if (challenges.length > 0) {
      await prisma.webAuthnChallenge.deleteMany({
        where: { challenge: { in: challenges } },
      });
    }
    await prisma.$disconnect();
  });

  it("rejects expired challenges", async () => {
    const challenge = `test-expired-${randomBytes(8).toString("hex")}`;
    challenges.push(challenge);
    await storeChallenge({
      challenge,
      type: "REGISTRATION",
      expiresAt: new Date(Date.now() - 1000),
      email: "challenge-test@example.com",
    });

    await expect(
      consumeChallenge({ challenge, type: "REGISTRATION" }),
    ).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
  });

  it("rejects reused challenges", async () => {
    const challenge = `test-reuse-${randomBytes(8).toString("hex")}`;
    challenges.push(challenge);
    await storeChallenge({
      challenge,
      type: "AUTHENTICATION",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await consumeChallenge({ challenge, type: "AUTHENTICATION" });
    await expect(
      consumeChallenge({ challenge, type: "AUTHENTICATION" }),
    ).rejects.toMatchObject({ code: "CHALLENGE_REUSED" });
  });

  it("rejects type mismatch", async () => {
    const challenge = `test-type-${randomBytes(8).toString("hex")}`;
    challenges.push(challenge);
    await storeChallenge({
      challenge,
      type: "REGISTRATION",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      consumeChallenge({ challenge, type: "AUTHENTICATION" }),
    ).rejects.toMatchObject({ code: "CHALLENGE_TYPE_MISMATCH" });
  });

  it("rejects unknown challenges", async () => {
    await expect(
      consumeChallenge({
        challenge: `missing-${randomBytes(8).toString("hex")}`,
        type: "AUTHENTICATION",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("auth HTTP surface", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const env = loadEnv({
      ...process.env,
      NODE_ENV: "test",
      API_PORT: "3001",
      WEB_ORIGIN: "http://localhost:3000",
      WEBAUTHN_RP_NAME: "AegisAuth",
      WEBAUTHN_RP_ID: "localhost",
      WEBAUTHN_ORIGIN: "http://localhost:3000",
    });
    app = await buildApp(env);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health still works", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", service: "aegisauth-api" });
  });

  it("GET /api/v1 still works", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1" });
    expect(res.statusCode).toBe(200);
  });

  it("rejects unauthenticated /api/v1/auth/me", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects invalid session cookie on /me", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { aegis_session: "not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
  });
});
