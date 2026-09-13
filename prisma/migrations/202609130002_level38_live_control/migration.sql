-- CreateEnum
BEGIN;
CREATE TYPE "PollType" AS ENUM ('NEXT_QUEST', 'NEXT_GAME', 'YES_NO', 'CUSTOM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestStatus" ADD VALUE 'LOCKED';
ALTER TYPE "QuestStatus" ADD VALUE 'SECRET';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "controlRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "imagePath" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "number" SERIAL NOT NULL,
ADD COLUMN     "overrideOptionId" TEXT,
ADD COLUMN     "overridePollId" TEXT,
ADD COLUMN     "overrideReason" TEXT,
ADD COLUMN     "type" "PollType" NOT NULL DEFAULT 'NEXT_QUEST',
ADD COLUMN     "voteRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "winnerAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "winningOptionId" TEXT,
ADD COLUMN     "winningPollId" TEXT;

-- AlterTable
ALTER TABLE "PollOption" ADD COLUMN     "gameId" TEXT,
ALTER COLUMN "questId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "undoOfId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Poll_number_key" ON "Poll"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PollOption_pollId_gameId_key" ON "PollOption"("pollId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_undoOfId_key" ON "AuditLog"("undoOfId");

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_winningOptionId_winningPollId_fkey" FOREIGN KEY ("winningOptionId", "winningPollId") REFERENCES "PollOption"("id", "pollId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_overrideOptionId_overridePollId_fkey" FOREIGN KEY ("overrideOptionId", "overridePollId") REFERENCES "PollOption"("id", "pollId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_gameId_eventId_fkey" FOREIGN KEY ("gameId", "eventId") REFERENCES "Game"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_undoOfId_fkey" FOREIGN KEY ("undoOfId") REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Poll_one_open_per_event" ON "Poll" ("eventId") WHERE "status" = 'OPEN';
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_reference_kind" CHECK ("questId" IS NULL OR "gameId" IS NULL);
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_winner_scope" CHECK (
  ("winningOptionId" IS NULL AND "winningPollId" IS NULL) OR
  ("winningOptionId" IS NOT NULL AND "winningPollId" IS NOT NULL AND "winningPollId" = "id")
);
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_override_scope" CHECK (
  ("overrideOptionId" IS NULL AND "overridePollId" IS NULL) OR
  ("overrideOptionId" IS NOT NULL AND "overridePollId" IS NOT NULL AND "overridePollId" = "id")
);
COMMIT;
