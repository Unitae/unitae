-- Fix RLS policies: replace OR-based pattern with CASE to prevent unsafe ::int cast.
--
-- PostgreSQL does NOT guarantee left-to-right short-circuit evaluation of OR.
-- The query optimizer may evaluate ''::int before the IS NULL / = '' guards,
-- causing "invalid input syntax for type integer" when a pool connection
-- retains app.congregation_id = '' after a SET LOCAL transaction reverts.
-- CASE guarantees sequential evaluation: the ::int cast only runs when the
-- value is a non-empty string.

-- User
DROP POLICY tenant_isolation ON "User";
CREATE POLICY tenant_isolation ON "User" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- CongregationUserRole
DROP POLICY tenant_isolation ON "CongregationUserRole";
CREATE POLICY tenant_isolation ON "CongregationUserRole" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- BoardSection
DROP POLICY tenant_isolation ON "BoardSection";
CREATE POLICY tenant_isolation ON "BoardSection" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- BoardDocument
DROP POLICY tenant_isolation ON "BoardDocument";
CREATE POLICY tenant_isolation ON "BoardDocument" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Territory
DROP POLICY tenant_isolation ON "Territory";
CREATE POLICY tenant_isolation ON "Territory" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Attribution
DROP POLICY tenant_isolation ON "Attribution";
CREATE POLICY tenant_isolation ON "Attribution" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- BuildingEntrance
DROP POLICY tenant_isolation ON "BuildingEntrance";
CREATE POLICY tenant_isolation ON "BuildingEntrance" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Building
DROP POLICY tenant_isolation ON "Building";
CREATE POLICY tenant_isolation ON "Building" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Setting
DROP POLICY tenant_isolation ON "Setting";
CREATE POLICY tenant_isolation ON "Setting" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- PublisherGroup
DROP POLICY tenant_isolation ON "PublisherGroup";
CREATE POLICY tenant_isolation ON "PublisherGroup" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- PublisherActivity
DROP POLICY tenant_isolation ON "PublisherActivity";
CREATE POLICY tenant_isolation ON "PublisherActivity" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Event
DROP POLICY tenant_isolation ON "Event";
CREATE POLICY tenant_isolation ON "Event" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- EventKind
DROP POLICY tenant_isolation ON "EventKind";
CREATE POLICY tenant_isolation ON "EventKind" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- DataDeletionRecord
DROP POLICY tenant_isolation ON "DataDeletionRecord";
CREATE POLICY tenant_isolation ON "DataDeletionRecord" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- ConsentRecord
DROP POLICY tenant_isolation ON "ConsentRecord";
CREATE POLICY tenant_isolation ON "ConsentRecord" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- AuditLog
DROP POLICY tenant_isolation ON "AuditLog";
CREATE POLICY tenant_isolation ON "AuditLog" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- BuildingAccess
DROP POLICY tenant_isolation ON "BuildingAccess";
CREATE POLICY tenant_isolation ON "BuildingAccess" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- BuildingResidentialData
DROP POLICY tenant_isolation ON "BuildingResidentialData";
CREATE POLICY tenant_isolation ON "BuildingResidentialData" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- ProgrammeTemplate
DROP POLICY tenant_isolation ON "ProgrammeTemplate";
CREATE POLICY tenant_isolation ON "ProgrammeTemplate" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- ProgrammeTemplatePart
DROP POLICY tenant_isolation ON "ProgrammeTemplatePart";
CREATE POLICY tenant_isolation ON "ProgrammeTemplatePart" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- ProgrammeTemplateServiceRole
DROP POLICY tenant_isolation ON "ProgrammeTemplateServiceRole";
CREATE POLICY tenant_isolation ON "ProgrammeTemplateServiceRole" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- ProgrammePartAssignment
DROP POLICY tenant_isolation ON "ProgrammePartAssignment";
CREATE POLICY tenant_isolation ON "ProgrammePartAssignment" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- ProgrammeServiceRoleAssignment
DROP POLICY tenant_isolation ON "ProgrammeServiceRoleAssignment";
CREATE POLICY tenant_isolation ON "ProgrammeServiceRoleAssignment" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- ProgrammeTemplateResponsible
DROP POLICY tenant_isolation ON "ProgrammeTemplateResponsible";
CREATE POLICY tenant_isolation ON "ProgrammeTemplateResponsible" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- NotificationEvent
DROP POLICY tenant_isolation ON "NotificationEvent";
CREATE POLICY tenant_isolation ON "NotificationEvent" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- NotificationPreference
DROP POLICY tenant_isolation ON "NotificationPreference";
CREATE POLICY tenant_isolation ON "NotificationPreference" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
