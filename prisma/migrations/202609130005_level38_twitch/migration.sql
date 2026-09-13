BEGIN;
CREATE TYPE "GameSource" AS ENUM ('AUTO_TWITCH', 'MANUAL_OVERRIDE');
ALTER TABLE "Event" ADD COLUMN "gameSource" "GameSource" NOT NULL DEFAULT 'AUTO_TWITCH', ADD COLUMN "manualOverrideBy" TEXT;
ALTER TABLE "Game" ADD COLUMN "twitchCategoryId" TEXT, ADD COLUMN "twitchCategoryName" TEXT;
CREATE UNIQUE INDEX "Game_eventId_twitchCategoryId_key" ON "Game"("eventId", "twitchCategoryId");
-- System-origin audit entries have no human operator; all existing rows stay intact.
ALTER TABLE "AuditLog" ALTER COLUMN "operatorId" DROP NOT NULL;
CREATE TABLE "TwitchState" (
  "eventId" TEXT NOT NULL PRIMARY KEY,
  "broadcasterId" TEXT NOT NULL,
  "categoryId" TEXT, "categoryName" TEXT, "channelTitle" TEXT,
  "observedAt" TIMESTAMP(3), "lastEventAt" TIMESTAMP(3),
  "subscriptionId" TEXT, "subscriptionStatus" TEXT NOT NULL DEFAULT 'unknown',
  "subscriptionSecretHash" TEXT,
  CONSTRAINT "TwitchState_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "TwitchMessage" ("id" TEXT NOT NULL PRIMARY KEY, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "TwitchMessage_receivedAt_idx" ON "TwitchMessage"("receivedAt");
COMMIT;
