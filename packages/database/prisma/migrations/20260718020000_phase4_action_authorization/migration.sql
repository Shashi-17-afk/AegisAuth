-- Phase 4: Intent-bound action authorization

-- AlterEnum
ALTER TYPE "WebAuthnChallengeType" ADD VALUE 'ACTION_AUTHORIZATION';

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM (
  'DELETE_APPLICATION',
  'ROTATE_APPLICATION_SECRET',
  'CHANGE_MEMBER_ROLE',
  'REMOVE_MEMBER',
  'EXPORT_SENSITIVE_DATA'
);

-- CreateEnum
CREATE TYPE "ActionTargetType" AS ENUM (
  'APPLICATION',
  'ORGANIZATION_MEMBER',
  'ORGANIZATION'
);

-- CreateEnum
CREATE TYPE "ActionAuthorizationStatus" AS ENUM (
  'PENDING',
  'AUTHORIZED',
  'EXECUTED',
  'EXPIRED',
  'CANCELLED',
  'FAILED'
);

-- CreateEnum
CREATE TYPE "ActionAuthorizationEventType" AS ENUM (
  'ACTION_AUTHORIZATION_CREATED',
  'ACTION_AUTHORIZATION_VERIFIED',
  'ACTION_AUTHORIZATION_EXECUTED',
  'ACTION_AUTHORIZATION_EXPIRED',
  'ACTION_AUTHORIZATION_CANCELLED',
  'ACTION_AUTHORIZATION_FAILED'
);

-- CreateTable
CREATE TABLE "action_authorizations" (
    "id" UUID NOT NULL,
    "platform_user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "action_type" "ActionType" NOT NULL,
    "target_type" "ActionTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "intent_payload" JSONB NOT NULL,
    "intent_hash" VARCHAR(64) NOT NULL,
    "display_summary" JSONB NOT NULL,
    "status" "ActionAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
    "risk_assessment_id" UUID,
    "pending_expires_at" TIMESTAMP(3) NOT NULL,
    "execution_expires_at" TIMESTAMP(3),
    "authorized_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_authorization_events" (
    "id" UUID NOT NULL,
    "action_authorization_id" UUID NOT NULL,
    "platform_user_id" UUID,
    "type" "ActionAuthorizationEventType" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_authorization_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_authorizations_platform_user_id_idx" ON "action_authorizations"("platform_user_id");

-- CreateIndex
CREATE INDEX "action_authorizations_organization_id_idx" ON "action_authorizations"("organization_id");

-- CreateIndex
CREATE INDEX "action_authorizations_status_idx" ON "action_authorizations"("status");

-- CreateIndex
CREATE INDEX "action_authorizations_created_at_idx" ON "action_authorizations"("created_at");

-- CreateIndex
CREATE INDEX "action_authorizations_intent_hash_idx" ON "action_authorizations"("intent_hash");

-- CreateIndex
CREATE INDEX "action_authorization_events_action_authorization_id_idx" ON "action_authorization_events"("action_authorization_id");

-- CreateIndex
CREATE INDEX "action_authorization_events_platform_user_id_idx" ON "action_authorization_events"("platform_user_id");

-- CreateIndex
CREATE INDEX "action_authorization_events_created_at_idx" ON "action_authorization_events"("created_at");

-- CreateIndex
CREATE INDEX "action_authorization_events_type_idx" ON "action_authorization_events"("type");

-- AddForeignKey
ALTER TABLE "action_authorizations" ADD CONSTRAINT "action_authorizations_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_authorizations" ADD CONSTRAINT "action_authorizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_authorizations" ADD CONSTRAINT "action_authorizations_risk_assessment_id_fkey" FOREIGN KEY ("risk_assessment_id") REFERENCES "risk_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_authorization_events" ADD CONSTRAINT "action_authorization_events_action_authorization_id_fkey" FOREIGN KEY ("action_authorization_id") REFERENCES "action_authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_authorization_events" ADD CONSTRAINT "action_authorization_events_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
