-- Enum values added by the previous migration must be committed before use.
BEGIN;
UPDATE "Event" SET "controlRevision" = "revision";
UPDATE "Quest" SET "status" = 'SECRET'
WHERE "isSecret" = true AND "revealedAt" IS NULL AND "status" = 'AVAILABLE';
COMMIT;
