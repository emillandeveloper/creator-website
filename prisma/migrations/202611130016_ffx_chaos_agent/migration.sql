-- Private dry-run connector. Independent of Twitch reward provisioning.
CREATE TABLE "ChaosAgent" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "gameRunning" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChaosAgent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChaosAgent_tokenHash_key" ON "ChaosAgent"("tokenHash");

CREATE TABLE "ChaosCommand" (
    "id" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    CONSTRAINT "ChaosCommand_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChaosCommand_status_createdAt_idx" ON "ChaosCommand"("status", "createdAt");
