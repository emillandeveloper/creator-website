-- Add persistent, server-owned deadlines without replacing rounds or their votes.
BEGIN;
ALTER TABLE "Poll"
  ADD COLUMN "durationSeconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "closeReason" TEXT;

ALTER TABLE "Poll" ADD CONSTRAINT "Poll_durationSeconds_check"
  CHECK ("durationSeconds" BETWEEN 1 AND 3600);
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_closeReason_check"
  CHECK ("closeReason" IS NULL OR "closeReason" IN ('MANUAL', 'TIMEOUT', 'CANCELLED'));

-- An already-open round retains its original server opening time on migration.
-- Expired rounds are reconciled once by the runtime after application startup.
UPDATE "Poll" SET "endsAt" = COALESCE("openedAt", CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '60 seconds'
  WHERE "status" = 'OPEN' AND "archivedAt" IS NULL;
CREATE INDEX "Poll_eventId_status_endsAt_idx" ON "Poll"("eventId", "status", "endsAt");
COMMIT;
