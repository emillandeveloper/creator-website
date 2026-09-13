-- Additive only. Existing named participants receive a class lazily on session/join.
-- Already-completed events are not retrospectively celebrated.
BEGIN;
ALTER TABLE "Participant" ADD COLUMN "classId" TEXT;
ALTER TABLE "Event" ADD COLUMN "unlockSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastUnlockedAt" TIMESTAMP(3);
COMMIT;
