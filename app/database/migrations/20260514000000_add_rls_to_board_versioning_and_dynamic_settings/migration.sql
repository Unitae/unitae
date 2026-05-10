-- Backfill missing RLS policies for two tenant-scoped tables that were created
-- without ENABLE ROW LEVEL SECURITY / CREATE POLICY (issue #171). Same shape as
-- every other scoped table — see 20260426000000_fix_rls_policy_cast_safety for
-- the rationale of the CASE form (guards the ::int cast against an empty string
-- left over on a pooled connection after SET LOCAL is rolled back).

-- BoardDocumentVersion
ALTER TABLE "BoardDocumentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoardDocumentVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BoardDocumentVersion" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- BoardDynamicDocumentSettings
ALTER TABLE "BoardDynamicDocumentSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoardDynamicDocumentSettings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BoardDynamicDocumentSettings" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
