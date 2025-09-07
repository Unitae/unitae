ALTER TABLE "Congregation" ADD COLUMN "displayName" TEXT;
ALTER TABLE "Congregation" ADD COLUMN "emailFromName" TEXT;
ALTER TABLE "Congregation" ADD COLUMN "emailFromAddress" TEXT;
ALTER TABLE "Congregation" ADD COLUMN "baseUrl" TEXT;

-- Backfill existing congregation
UPDATE "Congregation"
SET "displayName" = "name",
    "emailFromName" = "name",
    "emailFromAddress" = 'support@us.lyonconfluence.org',
    "baseUrl" = 'https://lyonconfluence.org'
WHERE "slug" = 'lyon-confluence';
