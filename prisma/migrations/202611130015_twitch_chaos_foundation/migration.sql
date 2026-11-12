-- Additive setup for the independent Twitch Chaos module. No existing data is changed.
CREATE TABLE "ChaosReward" (
    "id" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "twitchRewardId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChaosReward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChaosReward_twitchRewardId_key" ON "ChaosReward"("twitchRewardId");

CREATE TABLE "ChaosActivity" (
    "id" TEXT NOT NULL,
    "redemptionId" TEXT,
    "rewardId" TEXT NOT NULL,
    "viewer" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChaosActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChaosActivity_redemptionId_key" ON "ChaosActivity"("redemptionId");
CREATE INDEX "ChaosActivity_occurredAt_idx" ON "ChaosActivity"("occurredAt");
