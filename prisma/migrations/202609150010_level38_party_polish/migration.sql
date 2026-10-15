ALTER TABLE "Event" ALTER COLUMN "partyNameMode" SET DEFAULT 'ALWAYS';

-- Upgrade the untouched Phase 5.0 default without overwriting saved operator choices.
UPDATE "Event" AS event SET "partyNameMode" = 'ALWAYS'
WHERE event."partyNameMode" = 'ENTRY'
  AND NOT EXISTS (
    SELECT 1 FROM "AuditLog" AS audit
    WHERE audit."eventId" = event.id AND audit.action = 'party:configured'
  );
