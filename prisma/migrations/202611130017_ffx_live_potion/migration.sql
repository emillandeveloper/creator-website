-- All live writes start disabled. Existing dry-run commands stay dry-run.
ALTER TABLE "ChaosAgent"
  ADD COLUMN "livePotionArmed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ChaosCommand"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'DRY_RUN';
