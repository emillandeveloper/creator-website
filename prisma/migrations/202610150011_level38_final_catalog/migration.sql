-- Content synchronization is separate from this additive schema upgrade.
-- No quest, vote, participant, lifecycle state or audit is deleted or reassigned.
BEGIN;
CREATE TYPE "QuestCategory" AS ENUM ('MULTI_GAME', 'GAME_SPECIFIC', 'COOPERATIVE', 'SECRET');
ALTER TABLE "Quest" ADD COLUMN "catalogKey" TEXT,
  ADD COLUMN "category" "QuestCategory" NOT NULL DEFAULT 'GAME_SPECIFIC',
  ADD COLUMN "retiredAt" TIMESTAMP(3);
ALTER TABLE "Poll" ADD COLUMN "contextQuestId" TEXT;

-- Historical quests retain their original display numbers and foreign keys.
DROP INDEX "Quest_eventId_number_key";
CREATE UNIQUE INDEX "Quest_eventId_active_number_key" ON "Quest"("eventId", "number") WHERE "retiredAt" IS NULL;
CREATE INDEX "Quest_eventId_number_idx" ON "Quest"("eventId", "number");
CREATE UNIQUE INDEX "Quest_eventId_catalogKey_key" ON "Quest"("eventId", "catalogKey");

CREATE TABLE "QuestGame" (
  "questId" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  CONSTRAINT "QuestGame_pkey" PRIMARY KEY ("questId", "gameId"),
  CONSTRAINT "QuestGame_questId_eventId_fkey" FOREIGN KEY ("questId", "eventId") REFERENCES "Quest"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QuestGame_gameId_eventId_fkey" FOREIGN KEY ("gameId", "eventId") REFERENCES "Game"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "QuestGame_gameId_eventId_idx" ON "QuestGame"("gameId", "eventId");
-- Preserve old single-game behavior until the separately approved content sync.
INSERT INTO "QuestGame" ("questId", "gameId", "eventId") SELECT id, "gameId", "eventId" FROM "Quest";
COMMIT;
