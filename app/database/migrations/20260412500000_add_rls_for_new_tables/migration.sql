-- Enable RLS for BuildingAccess
ALTER TABLE "BuildingAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BuildingAccess" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BuildingAccess" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

-- Enable RLS for BuildingResidentialData
ALTER TABLE "BuildingResidentialData" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BuildingResidentialData" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BuildingResidentialData" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );
