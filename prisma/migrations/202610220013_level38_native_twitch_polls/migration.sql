-- Additive only: historical polls and votes remain WEB and are not rewritten.
CREATE TYPE "PollSource" AS ENUM ('WEB', 'TWITCH');
ALTER TABLE "Poll" ADD COLUMN "source" "PollSource" NOT NULL DEFAULT 'WEB',
 ADD COLUMN "twitchPollId" TEXT, ADD COLUMN "twitchStatus" TEXT,
 ADD COLUMN "twitchRequestedAt" TIMESTAMP(3), ADD COLUMN "twitchUpdatedAt" TIMESTAMP(3), ADD COLUMN "twitchSyncError" TEXT;
ALTER TABLE "PollOption" ADD COLUMN "twitchChoiceId" TEXT, ADD COLUMN "twitchLabel" TEXT,
 ADD COLUMN "twitchVotes" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Poll_twitchPollId_key" ON "Poll"("twitchPollId");
-- An untouched historical WEB/OPEN row must not block the first native round.
-- Each source still has at most one open round per event.
DROP INDEX "Poll_one_open_per_event";
CREATE UNIQUE INDEX "Poll_one_open_per_event" ON "Poll"("eventId", "source") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "PollOption_pollId_twitchChoiceId_key" ON "PollOption"("pollId", "twitchChoiceId");
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_twitchVotes_nonnegative" CHECK ("twitchVotes" >= 0);
CREATE TABLE "TwitchPollCredential" ("broadcasterId" TEXT PRIMARY KEY, "envelope" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL);
