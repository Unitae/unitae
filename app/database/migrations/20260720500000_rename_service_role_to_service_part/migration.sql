-- Renames the "ServiceRole" family to "ServicePart" so the "role" word is
-- unambiguously reserved for permission Roles. The four join tables in this
-- feature (Template/Event × Part/ServicePart × AllowedRole) now all read
-- consistently: `<parent>AllowedRole` means "which Roles are allowed on this
-- part slot".
--
-- Same shape as 20260720350000: ALTER TABLE ... RENAME preserves rows, FK
-- data, indexes, and RLS policies (bound to table OID, not name). Only the
-- catalog identifiers change.

-- 1. Rename tables.
ALTER TABLE "TemplateServiceRole"            RENAME TO "TemplateServicePart";
ALTER TABLE "EventServiceRole"               RENAME TO "EventServicePart";
ALTER TABLE "TemplateServiceRoleAllowedRole" RENAME TO "TemplateServicePartAllowedRole";
ALTER TABLE "EventServiceRoleAllowedRole"    RENAME TO "EventServicePartAllowedRole";

-- 2. Rename FK columns that referenced the old model names.
ALTER TABLE "EventServicePart"                RENAME COLUMN "serviceRoleId"      TO "servicePartId";
ALTER TABLE "TemplateServicePartAllowedRole"  RENAME COLUMN "serviceRoleId"      TO "servicePartId";
ALTER TABLE "EventServicePartAllowedRole"     RENAME COLUMN "eventServiceRoleId" TO "eventServicePartId";

-- 3. Rename primary-key constraints.
ALTER TABLE "TemplateServicePart"            RENAME CONSTRAINT "TemplateServiceRole_pkey"            TO "TemplateServicePart_pkey";
ALTER TABLE "EventServicePart"               RENAME CONSTRAINT "EventServiceRole_pkey"               TO "EventServicePart_pkey";
ALTER TABLE "TemplateServicePartAllowedRole" RENAME CONSTRAINT "TemplateServiceRoleAllowedRole_pkey" TO "TemplateServicePartAllowedRole_pkey";
ALTER TABLE "EventServicePartAllowedRole"    RENAME CONSTRAINT "EventServiceRoleAllowedRole_pkey"    TO "EventServicePartAllowedRole_pkey";

-- 4. Rename foreign-key constraints to match Prisma's `NewName_col_fkey`
--    convention. Missing renames here only cause cosmetic drift in
--    `\d`; queries still work because Postgres resolves FKs by OID.
ALTER TABLE "TemplateServicePart"
  RENAME CONSTRAINT "TemplateServiceRole_templateId_fkey"     TO "TemplateServicePart_templateId_fkey";
ALTER TABLE "TemplateServicePart"
  RENAME CONSTRAINT "TemplateServiceRole_congregationId_fkey" TO "TemplateServicePart_congregationId_fkey";

ALTER TABLE "EventServicePart"
  RENAME CONSTRAINT "EventServiceRole_eventId_fkey"         TO "EventServicePart_eventId_fkey";
ALTER TABLE "EventServicePart"
  RENAME CONSTRAINT "EventServiceRole_serviceRoleId_fkey"   TO "EventServicePart_servicePartId_fkey";
ALTER TABLE "EventServicePart"
  RENAME CONSTRAINT "EventServiceRole_assigneeId_fkey"      TO "EventServicePart_assigneeId_fkey";
ALTER TABLE "EventServicePart"
  RENAME CONSTRAINT "EventServiceRole_congregationId_fkey"  TO "EventServicePart_congregationId_fkey";

ALTER TABLE "TemplateServicePartAllowedRole"
  RENAME CONSTRAINT "TemplateServiceRoleAllowedRole_serviceRoleId_fkey"  TO "TemplateServicePartAllowedRole_servicePartId_fkey";
ALTER TABLE "TemplateServicePartAllowedRole"
  RENAME CONSTRAINT "TemplateServiceRoleAllowedRole_roleId_fkey"         TO "TemplateServicePartAllowedRole_roleId_fkey";
ALTER TABLE "TemplateServicePartAllowedRole"
  RENAME CONSTRAINT "TemplateServiceRoleAllowedRole_congregationId_fkey" TO "TemplateServicePartAllowedRole_congregationId_fkey";

ALTER TABLE "EventServicePartAllowedRole"
  RENAME CONSTRAINT "EventServiceRoleAllowedRole_eventServiceRoleId_fkey" TO "EventServicePartAllowedRole_eventServicePartId_fkey";
ALTER TABLE "EventServicePartAllowedRole"
  RENAME CONSTRAINT "EventServiceRoleAllowedRole_roleId_fkey"             TO "EventServicePartAllowedRole_roleId_fkey";
ALTER TABLE "EventServicePartAllowedRole"
  RENAME CONSTRAINT "EventServiceRoleAllowedRole_congregationId_fkey"     TO "EventServicePartAllowedRole_congregationId_fkey";

-- 5. Rename unique indexes.
ALTER INDEX "TemplateServiceRole_id_congregationId_key" RENAME TO "TemplateServicePart_id_congregationId_key";
ALTER INDEX "EventServiceRole_id_congregationId_key"    RENAME TO "EventServicePart_id_congregationId_key";

-- 6. Rewrite historical entityType strings so AuditLog readers see the new
--    model name for every past mutation (mirrors the Programme→Event fix in
--    20260720350000).
UPDATE "AuditLog"          SET "entityType" = 'TemplateServicePart' WHERE "entityType" = 'TemplateServiceRole';
UPDATE "AuditLog"          SET "entityType" = 'EventServicePart'    WHERE "entityType" = 'EventServiceRole';
UPDATE "NotificationEvent" SET "entityType" = 'EventServicePart'    WHERE "entityType" = 'EventServiceRole';

-- 7. Rewrite still-pending NotificationEvent debounce keys so the new
--    dispatchAssignmentDiffs lookup (`buildDebounceKey('EventServicePart',
--    ...)`) matches entries queued before the deploy. Sent rows are
--    historical and get pruned in 7-30 days.
UPDATE "NotificationEvent"
SET "debounceKey" = 'EventServicePart:' || substring("debounceKey" from length('EventServiceRole:') + 1)
WHERE "status" = 'pending' AND "debounceKey" LIKE 'EventServiceRole:%';
