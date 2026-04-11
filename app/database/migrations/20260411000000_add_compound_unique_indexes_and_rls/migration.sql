-- Compound unique indexes: enable findUnique({ where: { id_congregationId: { id, congregationId } } })
CREATE UNIQUE INDEX "Attribution_id_congregationId_key" ON "Attribution"("id", "congregationId");
CREATE UNIQUE INDEX "BoardDocument_id_congregationId_key" ON "BoardDocument"("id", "congregationId");
CREATE UNIQUE INDEX "BoardSection_id_congregationId_key" ON "BoardSection"("id", "congregationId");
CREATE UNIQUE INDEX "Building_id_congregationId_key" ON "Building"("id", "congregationId");
CREATE UNIQUE INDEX "BuildingEntrance_id_congregationId_key" ON "BuildingEntrance"("id", "congregationId");
CREATE UNIQUE INDEX "CongregationUserRole_id_congregationId_key" ON "CongregationUserRole"("id", "congregationId");
CREATE UNIQUE INDEX "Event_id_congregationId_key" ON "Event"("id", "congregationId");
CREATE UNIQUE INDEX "EventKind_id_congregationId_key" ON "EventKind"("id", "congregationId");
CREATE UNIQUE INDEX "PublisherActivity_id_congregationId_key" ON "PublisherActivity"("id", "congregationId");
CREATE UNIQUE INDEX "PublisherGroup_id_congregationId_key" ON "PublisherGroup"("id", "congregationId");
CREATE UNIQUE INDEX "Setting_id_congregationId_key" ON "Setting"("id", "congregationId");
CREATE UNIQUE INDEX "Territory_id_congregationId_key" ON "Territory"("id", "congregationId");
CREATE UNIQUE INDEX "User_id_congregationId_key" ON "User"("id", "congregationId");

-- Row-Level Security: DB-level tenant isolation safety net
-- Policy: when app.congregation_id is NOT set, all rows are visible (unscoped mode).
-- When set, only rows matching that congregation are visible.
-- FORCE ensures RLS applies even to the table owner role.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "CongregationUserRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CongregationUserRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CongregationUserRole" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "BoardSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoardSection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BoardSection" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "BoardDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoardDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BoardDocument" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "Territory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Territory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Territory" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "Attribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attribution" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Attribution" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "BuildingEntrance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BuildingEntrance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BuildingEntrance" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "Building" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Building" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Building" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Setting" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "PublisherGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublisherGroup" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PublisherGroup" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "PublisherActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublisherActivity" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PublisherActivity" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Event" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "EventKind" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventKind" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EventKind" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );
