# AegisAuth

Adaptive Passwordless Authentication & Verifiable Authorization Platform

## Overview

AegisAuth is a developer-first authentication and authorization platform. It helps applications authenticate users with minimal reliance on passwords and vulnerable communication channels, and extends authentication beyond login into sensitive action authorization.

**Current Phase: Phase 3 — Adaptive & Explainable Risk Engine**

Platform/developer accounts authenticate with WebAuthn passkeys. After a credential is verified, AegisAuth evaluates deterministic, explainable risk signals in **Observe Mode** (assessments are stored and displayed; valid passkey logins are not blocked).

## Problem

Passwords and weak shared-secret channels remain a primary source of account compromise. Applications also struggle to authorize high-risk actions after login with cryptographic evidence that can be audited. Even strong passkey auth benefits from transparent risk context around each attempt.

## Vision

- Passwordless identity using Passkeys / WebAuthn
- Adaptive, explainable risk-aware authentication
- Intent-bound cryptographic approval of sensitive actions
- Multi-party authorization policies
- Tamper-evident audit trails
- Secure recovery and emergency access
- Developer APIs and SDKs

## Planned Core Capabilities

| Capability | Status |
|---|---|
| Passkeys / WebAuthn (platform users) | **Implemented (Phase 2)** |
| Server-side session management | **Implemented (Phase 2)** |
| Passkey listing / session revocation | **Implemented (Phase 2)** |
| Adaptive explainable risk evaluation | **Implemented (Phase 3, Observe Mode)** |
| Sensitive action authorization | Planned |
| Multi-party approval policies | Planned |
| Tamper-evident audit trails | Planned |
| Secure account recovery | Planned |
| Emergency / break-glass access | Planned |
| Application end-user auth + SDKs | Planned |

## Architecture

```
Browser
   │  WebAuthn Ceremony (passkey create / get)
   ▼
Next.js Web Application
   │  credentialed fetch (HttpOnly cookie) via Route Handler proxy
   ▼
Fastify Platform Auth API
   │  Verify challenge + origin + RP ID
   ▼
SimpleWebAuthn
   │
   ▼
Risk Context Collector ──► @aegisauth/risk-engine (pure)
   │                              │
   │                              ├─ Signals
   │                              ├─ Score / Level
   │                              └─ Reasons + recommended decision
   ▼
Risk Assessment (persisted, Observe Mode)
   │
   ▼
Session Created (Phase 3 does not block valid WebAuthn)
   │
   ▼
Prisma → Supabase PostgreSQL
```

**Private passkey keys never reach AegisAuth.** Only public credential material is stored.

**Important:** Supabase is used only as managed PostgreSQL infrastructure. AegisAuth implements its own authentication. Do **not** use Supabase Auth, magic links, OTP, or social login.

### Phase 3 risk flow

```
Verified Passkey
      │
      ▼
Risk Context Collector
      │
      ▼
Risk Engine
      │
      ├── Signals
      ├── Score
      ├── Level
      └── Reasons
      │
      ▼
Risk Assessment
      │
      ▼
OBSERVE MODE
      │
      ▼
Session Created
```

## Risk Engine (Phase 3)

### Why risk-aware authentication exists

Passkeys prove possession of an authenticator. They do not by themselves explain whether the surrounding context looks routine or anomalous. AegisAuth records an explainable risk assessment on successful platform login so operators can see **why** a login looked low or elevated risk.

### Observe Mode

`RISK_MODE=observe` (default) calculates, stores, and displays assessments.  
`recommendedDecision` may be `ALLOW`, `STEP_UP`, or `DENY`.  
`enforcedDecision` remains `ALLOW` for valid WebAuthn while mode is Observe.

**Phase 3 does not block legitimate passkey authentication.** Enforcement is scaffolded (`RISK_MODE=enforce`) but must not be enabled without dedicated future work and tests.

### Not AI / not ML

This is a **deterministic rule-based** engine. It does not use LLMs, does not claim machine learning, and does not label heuristics as AI. Future ML enhancement is possible but not part of Phase 3.

### Signals evaluated

| Signal | Intent |
|---|---|
| Unknown User-Agent | New browser/device **profile** (weak; spoofable) |
| Unknown IP | IP not seen on prior success (IPs change often) |
| Recent failures | Failures in 10m / 1h windows |
| Rapid attempts | Burst activity in a 2m window |
| New credential | First use / recently registered |
| New account | Very young account (low weight) |
| High session count | Unusually many concurrent sessions |
| Long dormancy | Long gap since last success |
| Compound rules | New UA+IP; new UA+IP+failures |

Weights and thresholds live in `packages/risk-engine/src/config.ts` as **initial policy defaults for demonstration** — not scientifically calibrated fraud probabilities. Production deployments should recalibrate using observed traffic.

### Privacy & limitations

- No canvas/audio/font/hardware fingerprinting
- No geolocation permission, camera, or microphone
- No external IP geolocation services
- Dashboard shows **masked** IPs; backend may store normalized IP for known-IP comparison
- User-Agent is truncated and treated as a weak profile signal — not a physical device identity
- Client IP uses Fastify `request.ip` (respects `trustProxy`). Do **not** blindly trust `X-Forwarded-For`. Production must configure `trustProxy` for known reverse-proxy hops only (`trustProxy: false` by default).

### Organization access

Without an active-organization selector: **OWNER/ADMIN** see risk data for members of organizations they administer; **MEMBER** sees only their own assessments. Checks are server-side.

## WebAuthn & Sessions (Phase 2)

### Registration

1. `POST /api/v1/auth/register/options`
2. Browser `startRegistration()`
3. `POST /api/v1/auth/register/verify` → user/org/passkey + session

### Authentication

1. `POST /api/v1/auth/login/options`
2. Browser `startAuthentication()`
3. `POST /api/v1/auth/login/verify` → verify WebAuthn → risk context → persist assessment (Observe) → session

### Session security

- Opaque HttpOnly cookie (`aegis_session`); SHA-256 hash only in DB
- `Secure` in production; `SameSite=Lax`; `Path=/`
- No localStorage auth tokens; no JWT-only auth; no passwords/OTP

## Tech Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Frontend:** Next.js 15, React 19, Tailwind, `@simplewebauthn/browser`
- **Backend:** Fastify 5, Zod, `@simplewebauthn/server`
- **Risk:** `@aegisauth/risk-engine` (pure TypeScript)
- **Database:** PostgreSQL (Supabase) via Prisma 6

## Monorepo Structure

```
aegisauth/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # Fastify REST API + WebAuthn + risk routes
├── packages/
│   ├── database/     # Prisma schema + client
│   ├── risk-engine/  # Deterministic explainable risk evaluation
│   └── shared/       # Shared Zod schemas / types
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
└── README.md
```

## Getting Started

```bash
pnpm install
# Ensure .env has DATABASE_URL, DIRECT_URL, WebAuthn vars, RISK_MODE=observe
pnpm db:generate
pnpm db:migrate:deploy
pnpm dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:3001 |

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

## Environment Variables

| Variable | Used by | Browser? | Purpose |
|---|---|---|---|
| `DATABASE_URL` | database / API | No | Pooler PostgreSQL URL |
| `DIRECT_URL` | database migrations | No | Direct PostgreSQL URL |
| `API_PORT` | API | No | Listen port |
| `WEB_ORIGIN` | API CORS | No | Allowed web origin |
| `WEBAUTHN_*` | API | No | Relying Party config |
| `SESSION_TTL_SECONDS` | API | No | Session lifetime |
| `WEBAUTHN_CHALLENGE_TTL_SECONDS` | API | No | Challenge lifetime |
| `RISK_MODE` | API | No | `observe` (default) or `enforce` |
| `RATE_LIMIT_*` | API | No | In-memory auth rate limits |
| `NEXT_PUBLIC_API_URL` | web | **Yes** | Proxy upstream target |

## Risk API (authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/risk/summary` | Counts + recent assessments |
| GET | `/api/v1/risk/assessments` | List assessments |
| GET | `/api/v1/risk/assessments/:id` | Detail + signals |
| GET | `/api/v1/risk/events` | Auth events with risk |
| POST | `/api/v1/risk/simulate` | Simulation only (not persisted) |

## Manual Passkey + Risk Test

1. `pnpm dev`
2. Login with an existing passkey (or register first)
3. Confirm authentication still succeeds
4. Open `/dashboard` — risk summary should show at least one assessment
5. Open `/dashboard/authentication` — score, level, recommended decision, Observe Mode
6. Open assessment detail — triggered signals with human-readable reasons
7. Logout and login again — known IP/UA context may reduce score vs first observation from that environment

## Current Implementation Status

### Implemented

- Phase 1 foundation + Phase 2 passkey identity/sessions
- `@aegisauth/risk-engine` with unit tests
- Risk assessments persisted on successful passkey login (Observe Mode)
- Dashboard risk overview + authentication explainability UI
- Organization-scoped risk APIs

### Not Yet Implemented

- Enforce mode (blocking) as a supported production setting
- Email verification / recovery / break-glass
- Sensitive action authorization / multi-party policies
- Tamper-evident audit chain
- Application end-user auth + SDK

## Security Philosophy

1. Never invent cryptography — use SimpleWebAuthn + Node `crypto`.
2. Never store passwords or passkey private keys.
3. Never use Supabase Auth.
4. Never put auth tokens in `localStorage` / `sessionStorage`.
5. Verify challenge, origin, and RP ID on every ceremony.
6. Hash session tokens at rest; revoke on logout.
7. Keep risk evaluation explainable and deterministic — not opaque “AI scores.”
8. Fail-safe: risk engine errors must not corrupt authentication state.
9. Keep secrets server-side; validate env at startup.

## License

Private / unpublished — hackathon project.
