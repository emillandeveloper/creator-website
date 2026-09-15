ALTER TABLE "Participant" ADD COLUMN "streamVisible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "partyEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "partyNameMode" TEXT NOT NULL DEFAULT 'ENTRY',
  ADD COLUMN "partyMaxVisible" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Event" ADD CONSTRAINT "Event_partyNameMode_check" CHECK ("partyNameMode" IN ('OFF', 'ENTRY', 'ALWAYS')),
  ADD CONSTRAINT "Event_partyMaxVisible_check" CHECK ("partyMaxVisible" BETWEEN 1 AND 50);
