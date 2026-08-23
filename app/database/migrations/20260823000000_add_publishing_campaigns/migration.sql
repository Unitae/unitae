-- Publishing campaigns: first-class Campaign aggregate + campaign/pause layers on Attribution.
-- Order matters: the legacy `type = 'campaign'` rows are migrated into real Campaign records
-- BEFORE the enum swap — the `USING` cast would fail while any 'campaign' value remains.

-- CreateEnum
CREATE TYPE "CampaignRegularStartAction" AS ENUM ('pause', 'close', 'leave');

-- CreateEnum
CREATE TYPE "CampaignRegularEndAction" AS ENUM ('resume', 'keep-paused', 'close');

-- AlterTable
ALTER TABLE "Attribution" ADD COLUMN     "campaignId" INTEGER,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedByCampaignId" INTEGER;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "restPeriodDays" INTEGER,
    "startRegularAction" "CampaignRegularStartAction" NOT NULL DEFAULT 'pause',
    "startAutoReassign" BOOLEAN NOT NULL DEFAULT false,
    "endCloseCampaign" BOOLEAN NOT NULL DEFAULT true,
    "endRegularAction" "CampaignRegularEndAction" NOT NULL DEFAULT 'resume',
    "activatedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTerritory" (
    "campaignId" INTEGER NOT NULL,
    "territoryId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "CampaignTerritory_pkey" PRIMARY KEY ("campaignId","territoryId")
);

-- CreateIndex
CREATE INDEX "Campaign_congregationId_idx" ON "Campaign"("congregationId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_id_congregationId_key" ON "Campaign"("id", "congregationId");

-- CreateIndex
CREATE INDEX "CampaignTerritory_congregationId_idx" ON "CampaignTerritory"("congregationId");

-- CreateIndex
CREATE INDEX "Attribution_campaignId_idx" ON "Attribution"("campaignId");

-- CreateIndex
CREATE INDEX "Attribution_pausedByCampaignId_idx" ON "Attribution"("pausedByCampaignId");

-- AddForeignKey
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_campaignId_congregationId_fkey" FOREIGN KEY ("campaignId", "congregationId") REFERENCES "Campaign"("id", "congregationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_pausedByCampaignId_congregationId_fkey" FOREIGN KEY ("pausedByCampaignId", "congregationId") REFERENCES "Campaign"("id", "congregationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTerritory" ADD CONSTRAINT "CampaignTerritory_campaignId_congregationId_fkey" FOREIGN KEY ("campaignId", "congregationId") REFERENCES "Campaign"("id", "congregationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTerritory" ADD CONSTRAINT "CampaignTerritory_territoryId_congregationId_fkey" FOREIGN KEY ("territoryId", "congregationId") REFERENCES "Territory"("id", "congregationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTerritory" ADD CONSTRAINT "CampaignTerritory_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DataMigration: one already-ended synthetic campaign per congregation that has legacy
-- `type = 'campaign'` rows, spanning their min(startDate)..max(startDate|endDate); then
-- repoint those rows onto it and reset their method to 'default'. The Campaign table was
-- created above, so every row in it here is one of our synthetic campaigns.
WITH bounds AS (
    SELECT "congregationId",
           MIN("startDate")                                            AS start_date,
           MAX(GREATEST("startDate", COALESCE("endDate", "startDate"))) AS end_date
    FROM "Attribution"
    WHERE "type" = 'campaign'
    GROUP BY "congregationId"
)
INSERT INTO "Campaign" ("name", "startDate", "endDate", "activatedAt", "endedAt", "congregationId", "updatedAt")
SELECT 'Campagne', b.start_date, b.end_date, b.start_date, b.end_date, b."congregationId", CURRENT_TIMESTAMP
FROM bounds b;

UPDATE "Attribution" a
SET "campaignId" = c."id",
    "type"       = 'default'
FROM "Campaign" c
WHERE a."type" = 'campaign'
  AND c."congregationId" = a."congregationId";

-- AlterEnum (safe now — no row holds 'campaign' anymore)
BEGIN;
CREATE TYPE "TerritoryAttributionKind_new" AS ENUM ('default', 'phones');
ALTER TABLE "Attribution" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Attribution" ALTER COLUMN "type" TYPE "TerritoryAttributionKind_new" USING ("type"::text::"TerritoryAttributionKind_new");
ALTER TYPE "TerritoryAttributionKind" RENAME TO "TerritoryAttributionKind_old";
ALTER TYPE "TerritoryAttributionKind_new" RENAME TO "TerritoryAttributionKind";
DROP TYPE "TerritoryAttributionKind_old";
ALTER TABLE "Attribution" ALTER COLUMN "type" SET DEFAULT 'default';
COMMIT;

-- Row-Level Security — same shape as every other tenant-scoped table (CASE form guards
-- the ::int cast against an empty string on a pooled connection, see
-- 20260426000000_fix_rls_policy_cast_safety).
ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campaign" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Campaign" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "CampaignTerritory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CampaignTerritory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CampaignTerritory" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Campaign attributions are due when the campaign closes (or use the regular method
-- duration when endCloseCampaign is off) — the per-type campaign duration setting is gone.
DELETE FROM "Setting"
WHERE "key" = 'attribution-campaign-duration-days';
