-- Existing title/description remain the English and legacy content. No state/history rewrite.
BEGIN;
ALTER TABLE "Quest" ADD COLUMN "titleEs" TEXT, ADD COLUMN "descriptionEs" TEXT;
COMMIT;
