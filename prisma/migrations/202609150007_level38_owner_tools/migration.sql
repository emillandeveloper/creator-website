BEGIN;
ALTER TABLE "Event" ADD COLUMN "resetSequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Quest" ADD COLUMN "initialStatus" "QuestStatus" NOT NULL DEFAULT 'AVAILABLE';
UPDATE "Quest" SET "initialStatus" = CASE
  WHEN "isSecret" OR status = 'SECRET' THEN 'SECRET'::"QuestStatus"
  WHEN status = 'LOCKED' THEN 'LOCKED'::"QuestStatus"
  ELSE 'AVAILABLE'::"QuestStatus" END;
ALTER TABLE "Quest" ADD CONSTRAINT "quest_initial_status" CHECK ("initialStatus" IN ('AVAILABLE', 'LOCKED', 'SECRET'));
ALTER TABLE "Poll" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Poll" ADD CONSTRAINT "archived_poll_closed" CHECK ("archivedAt" IS NULL OR status = 'CLOSED');
COMMIT;
