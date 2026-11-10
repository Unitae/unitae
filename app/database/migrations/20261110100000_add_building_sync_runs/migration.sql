-- BuildingSync: one row per run of the address sync (who, which source, how it ended), and
-- Building.lastSeenInSourceAt: when a sync last listed the building.
--
-- Contract: no building changes list. Every building the last sync listed (inOpenData) gets a
-- last-seen date, so the next run can tell the buildings it no longer finds from the ones a sync
-- never listed (made by hand). Buildings with inOpenData = false keep NULL: whether a sync ever
-- listed them was never recorded.
--
-- Additive only: the application code still deployed reads inOpenData and never this column.
-- Restoring an archive exported before this column applies the same rule (import-buildings.server.ts).

-- 1. Enums
CREATE TYPE "BuildingSyncProvider" AS ENUM ('bano');
CREATE TYPE "BuildingSyncStatus" AS ENUM ('running', 'completed', 'failed');
CREATE TYPE "BuildingSyncError" AS ENUM ('source-unreachable', 'source-refused', 'source-too-large', 'source-unreadable', 'no-matching-address', 'interrupted', 'unknown');

-- 2. The table
CREATE TABLE "BuildingSync" (
    "id" SERIAL NOT NULL,
    "provider" "BuildingSyncProvider" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" "BuildingSyncStatus" NOT NULL DEFAULT 'running',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER,
    "missingCount" INTEGER,
    "error" "BuildingSyncError",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedById" INTEGER,
    "congregationId" INTEGER NOT NULL,
    CONSTRAINT "BuildingSync_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BuildingSync_congregationId_startedAt_idx" ON "BuildingSync"("congregationId", "startedAt");
CREATE UNIQUE INDEX "BuildingSync_id_congregationId_key" ON "BuildingSync"("id", "congregationId");

-- A run outlives the account that started it; it goes with its congregation.
ALTER TABLE "BuildingSync" ADD CONSTRAINT "BuildingSync_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuildingSync" ADD CONSTRAINT "BuildingSync_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Row-Level Security
-- CASE/WHEN rather than OR: the planner may reorder OR branches and leak rows.
-- See docs/development/row-level-security.md.
ALTER TABLE "BuildingSync" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BuildingSync" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BuildingSync" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- 4. The last-seen date
ALTER TABLE "Building" ADD COLUMN "lastSeenInSourceAt" TIMESTAMP(3);

-- 5. Buildings the last sync listed were seen by it. IS NULL keeps a second run from moving a
-- date a sync has already written.
UPDATE "Building"
SET "lastSeenInSourceAt" = CURRENT_TIMESTAMP
WHERE "inOpenData" = true AND "lastSeenInSourceAt" IS NULL;
