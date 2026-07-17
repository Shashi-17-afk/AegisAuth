-- Phase 3: Explainable risk assessments (observe mode)
-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskDecision" AS ENUM ('ALLOW', 'STEP_UP', 'DENY');

-- CreateEnum
CREATE TYPE "RiskMode" AS ENUM ('OBSERVE', 'ENFORCE');

-- CreateEnum
CREATE TYPE "RiskSignalType" AS ENUM (
  'UNKNOWN_USER_AGENT',
  'UNKNOWN_IP',
  'RECENT_FAILURES',
  'RAPID_ATTEMPTS',
  'NEW_CREDENTIAL',
  'NEW_ACCOUNT',
  'HIGH_SESSION_COUNT',
  'LONG_DORMANCY',
  'COMPOUND_NEW_CONTEXT',
  'COMPOUND_NEW_CONTEXT_WITH_FAILURES'
);

-- CreateEnum
CREATE TYPE "RiskSignalSeverity" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" UUID NOT NULL,
    "platform_user_id" UUID NOT NULL,
    "authentication_event_id" UUID,
    "score" INTEGER NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "recommended_decision" "RiskDecision" NOT NULL,
    "enforced_decision" "RiskDecision" NOT NULL,
    "mode" "RiskMode" NOT NULL,
    "ip_address" TEXT,
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_signals" (
    "id" UUID NOT NULL,
    "risk_assessment_id" UUID NOT NULL,
    "type" "RiskSignalType" NOT NULL,
    "triggered" BOOLEAN NOT NULL,
    "contribution" INTEGER NOT NULL,
    "severity" "RiskSignalSeverity" NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_assessments_platform_user_id_idx" ON "risk_assessments"("platform_user_id");

-- CreateIndex
CREATE INDEX "risk_assessments_created_at_idx" ON "risk_assessments"("created_at");

-- CreateIndex
CREATE INDEX "risk_assessments_level_idx" ON "risk_assessments"("level");

-- CreateIndex
CREATE INDEX "risk_assessments_authentication_event_id_idx" ON "risk_assessments"("authentication_event_id");

-- CreateIndex
CREATE INDEX "risk_signals_risk_assessment_id_idx" ON "risk_signals"("risk_assessment_id");

-- CreateIndex
CREATE INDEX "risk_signals_type_idx" ON "risk_signals"("type");

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_authentication_event_id_fkey" FOREIGN KEY ("authentication_event_id") REFERENCES "authentication_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_risk_assessment_id_fkey" FOREIGN KEY ("risk_assessment_id") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
