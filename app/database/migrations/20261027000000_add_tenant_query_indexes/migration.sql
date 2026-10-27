-- Index the hot read paths of three tenant tables.
--
-- RLS adds `"congregationId" = <current congregation>` to every query on a tenant table, but
-- these tables had no index leading with it (only the `(id, congregationId)` unique key, which
-- leads with id). Their common queries therefore scanned every congregation's rows:
--
--   Attribution — the territoryId and publisherId foreign keys were unindexed: every territory
--     list joins attributions by territoryId (about 15 includes), "my territories" filters by
--     publisherId, and deleting a territory checks the foreign key. The dashboard and the
--     group overview count a congregation's current attributions (`endDate IS NULL`).
--   Event — programme and calendar views select a congregation's events by startDate range.
--   PublisherActivity — monthly reports read a congregation's activity for a year and month;
--     the existing index leads with publisherId and cannot serve them.
--
-- Plain CREATE INDEX (not CONCURRENTLY) because Prisma runs each migration inside a
-- transaction, which CONCURRENTLY forbids. Each table holds a few thousand rows per
-- congregation, so the write lock lasts well under a second. IF NOT EXISTS keeps the migration
-- safe where an index was already created by hand.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attribution_territoryId_idx" ON "Attribution"("territoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attribution_publisherId_idx" ON "Attribution"("publisherId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attribution_congregationId_endDate_idx" ON "Attribution"("congregationId", "endDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Event_congregationId_startDate_idx" ON "Event"("congregationId", "startDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PublisherActivity_congregationId_year_month_idx" ON "PublisherActivity"("congregationId", "year", "month");
