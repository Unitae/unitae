-- Pure naming rename. Tables → new names; PKs / FKs / indexes get renamed
-- to match Prisma's naming convention. `ALTER TABLE … RENAME TO` preserves
-- rows, FK data, and RLS policies (they are bound to table OIDs, not names)
-- — the `20260507000000_rename_user_role_to_permission` precedent did the
-- same. Historical entityType strings on AuditLog and NotificationEvent are
-- rewritten in step 5 so audit queries stay uniform.

-- 1. Table renames.
ALTER TABLE "ProgrammeTemplate"                         RENAME TO "EventTemplate";
ALTER TABLE "ProgrammeTemplatePart"                     RENAME TO "TemplatePart";
ALTER TABLE "ProgrammeTemplateServiceRole"              RENAME TO "TemplateServiceRole";
ALTER TABLE "ProgrammePartAssignment"                   RENAME TO "EventPart";
ALTER TABLE "ProgrammeServiceRoleAssignment"            RENAME TO "EventServiceRole";
ALTER TABLE "ProgrammeTemplateResponsible"              RENAME TO "TemplateResponsible";
ALTER TABLE "ProgrammeTemplatePartAllowedRole"          RENAME TO "TemplatePartAllowedRole";
ALTER TABLE "ProgrammePartAssignmentAllowedRole"        RENAME TO "EventPartAllowedRole";
ALTER TABLE "ProgrammeTemplateServiceRoleAllowedRole"   RENAME TO "TemplateServiceRoleAllowedRole";
ALTER TABLE "ProgrammeServiceRoleAssignmentAllowedRole" RENAME TO "EventServiceRoleAllowedRole";

-- 2. Primary key constraint renames.
ALTER TABLE "EventTemplate"                  RENAME CONSTRAINT "ProgrammeTemplate_pkey"                         TO "EventTemplate_pkey";
ALTER TABLE "TemplatePart"                   RENAME CONSTRAINT "ProgrammeTemplatePart_pkey"                     TO "TemplatePart_pkey";
ALTER TABLE "TemplateServiceRole"            RENAME CONSTRAINT "ProgrammeTemplateServiceRole_pkey"              TO "TemplateServiceRole_pkey";
ALTER TABLE "EventPart"                      RENAME CONSTRAINT "ProgrammePartAssignment_pkey"                   TO "EventPart_pkey";
ALTER TABLE "EventServiceRole"               RENAME CONSTRAINT "ProgrammeServiceRoleAssignment_pkey"            TO "EventServiceRole_pkey";
ALTER TABLE "TemplateResponsible"            RENAME CONSTRAINT "ProgrammeTemplateResponsible_pkey"              TO "TemplateResponsible_pkey";
ALTER TABLE "TemplatePartAllowedRole"        RENAME CONSTRAINT "ProgrammeTemplatePartAllowedRole_pkey"          TO "TemplatePartAllowedRole_pkey";
ALTER TABLE "EventPartAllowedRole"           RENAME CONSTRAINT "ProgrammePartAssignmentAllowedRole_pkey"        TO "EventPartAllowedRole_pkey";
ALTER TABLE "TemplateServiceRoleAllowedRole" RENAME CONSTRAINT "ProgrammeTemplateServiceRoleAllowedRole_pkey"   TO "TemplateServiceRoleAllowedRole_pkey";
ALTER TABLE "EventServiceRoleAllowedRole"    RENAME CONSTRAINT "ProgrammeServiceRoleAssignmentAllowedRole_pkey" TO "EventServiceRoleAllowedRole_pkey";

-- 3. Foreign key constraint renames.
ALTER TABLE "EventTemplate" RENAME CONSTRAINT "ProgrammeTemplate_congregationId_fkey" TO "EventTemplate_congregationId_fkey";

ALTER TABLE "TemplatePart" RENAME CONSTRAINT "ProgrammeTemplatePart_congregationId_fkey" TO "TemplatePart_congregationId_fkey";
ALTER TABLE "TemplatePart" RENAME CONSTRAINT "ProgrammeTemplatePart_templateId_fkey"     TO "TemplatePart_templateId_fkey";

ALTER TABLE "TemplateServiceRole" RENAME CONSTRAINT "ProgrammeTemplateServiceRole_congregationId_fkey" TO "TemplateServiceRole_congregationId_fkey";
ALTER TABLE "TemplateServiceRole" RENAME CONSTRAINT "ProgrammeTemplateServiceRole_templateId_fkey"     TO "TemplateServiceRole_templateId_fkey";

ALTER TABLE "EventPart" RENAME CONSTRAINT "ProgrammePartAssignment_assigneeId_fkey"        TO "EventPart_assigneeId_fkey";
ALTER TABLE "EventPart" RENAME CONSTRAINT "ProgrammePartAssignment_assistantId_fkey"       TO "EventPart_assistantId_fkey";
ALTER TABLE "EventPart" RENAME CONSTRAINT "ProgrammePartAssignment_congregationId_fkey"    TO "EventPart_congregationId_fkey";
ALTER TABLE "EventPart" RENAME CONSTRAINT "ProgrammePartAssignment_eventId_fkey"           TO "EventPart_eventId_fkey";
ALTER TABLE "EventPart" RENAME CONSTRAINT "ProgrammePartAssignment_externalSpeakerId_fkey" TO "EventPart_externalSpeakerId_fkey";
ALTER TABLE "EventPart" RENAME CONSTRAINT "ProgrammePartAssignment_partId_fkey"            TO "EventPart_partId_fkey";

ALTER TABLE "EventServiceRole" RENAME CONSTRAINT "ProgrammeServiceRoleAssignment_assigneeId_fkey"     TO "EventServiceRole_assigneeId_fkey";
ALTER TABLE "EventServiceRole" RENAME CONSTRAINT "ProgrammeServiceRoleAssignment_congregationId_fkey" TO "EventServiceRole_congregationId_fkey";
ALTER TABLE "EventServiceRole" RENAME CONSTRAINT "ProgrammeServiceRoleAssignment_eventId_fkey"        TO "EventServiceRole_eventId_fkey";
ALTER TABLE "EventServiceRole" RENAME CONSTRAINT "ProgrammeServiceRoleAssignment_serviceRoleId_fkey"  TO "EventServiceRole_serviceRoleId_fkey";

ALTER TABLE "TemplateResponsible" RENAME CONSTRAINT "ProgrammeTemplateResponsible_congregationId_fkey" TO "TemplateResponsible_congregationId_fkey";
ALTER TABLE "TemplateResponsible" RENAME CONSTRAINT "ProgrammeTemplateResponsible_templateId_fkey"     TO "TemplateResponsible_templateId_fkey";
ALTER TABLE "TemplateResponsible" RENAME CONSTRAINT "ProgrammeTemplateResponsible_userId_fkey"         TO "TemplateResponsible_userId_fkey";

ALTER TABLE "TemplatePartAllowedRole" RENAME CONSTRAINT "ProgrammeTemplatePartAllowedRole_congregationId_fkey" TO "TemplatePartAllowedRole_congregationId_fkey";
ALTER TABLE "TemplatePartAllowedRole" RENAME CONSTRAINT "ProgrammeTemplatePartAllowedRole_partId_fkey"         TO "TemplatePartAllowedRole_partId_fkey";
ALTER TABLE "TemplatePartAllowedRole" RENAME CONSTRAINT "ProgrammeTemplatePartAllowedRole_roleId_fkey"         TO "TemplatePartAllowedRole_roleId_fkey";

ALTER TABLE "EventPartAllowedRole" RENAME CONSTRAINT "ProgrammePartAssignmentAllowedRole_assignmentId_fkey"   TO "EventPartAllowedRole_assignmentId_fkey";
ALTER TABLE "EventPartAllowedRole" RENAME CONSTRAINT "ProgrammePartAssignmentAllowedRole_congregationId_fkey" TO "EventPartAllowedRole_congregationId_fkey";
ALTER TABLE "EventPartAllowedRole" RENAME CONSTRAINT "ProgrammePartAssignmentAllowedRole_roleId_fkey"         TO "EventPartAllowedRole_roleId_fkey";

ALTER TABLE "TemplateServiceRoleAllowedRole" RENAME CONSTRAINT "ProgrammeTemplateServiceRoleAllowedRole_congregationId_fkey" TO "TemplateServiceRoleAllowedRole_congregationId_fkey";
ALTER TABLE "TemplateServiceRoleAllowedRole" RENAME CONSTRAINT "ProgrammeTemplateServiceRoleAllowedRole_roleId_fkey"         TO "TemplateServiceRoleAllowedRole_roleId_fkey";
ALTER TABLE "TemplateServiceRoleAllowedRole" RENAME CONSTRAINT "ProgrammeTemplateServiceRoleAllowedRole_serviceRoleId_fkey"  TO "TemplateServiceRoleAllowedRole_serviceRoleId_fkey";

ALTER TABLE "EventServiceRoleAllowedRole" RENAME CONSTRAINT "ProgrammeServiceRoleAssignmentAllowedRole_assignmentId_fkey"   TO "EventServiceRoleAllowedRole_assignmentId_fkey";
ALTER TABLE "EventServiceRoleAllowedRole" RENAME CONSTRAINT "ProgrammeServiceRoleAssignmentAllowedRole_congregationId_fkey" TO "EventServiceRoleAllowedRole_congregationId_fkey";
ALTER TABLE "EventServiceRoleAllowedRole" RENAME CONSTRAINT "ProgrammeServiceRoleAssignmentAllowedRole_roleId_fkey"         TO "EventServiceRoleAllowedRole_roleId_fkey";

-- 4. Index renames.
ALTER INDEX "ProgrammeTemplate_id_congregationId_key"                      RENAME TO "EventTemplate_id_congregationId_key";
ALTER INDEX "ProgrammeTemplate_key_congregationId_key"                     RENAME TO "EventTemplate_key_congregationId_key";

ALTER INDEX "ProgrammeTemplatePart_id_congregationId_key"                  RENAME TO "TemplatePart_id_congregationId_key";

ALTER INDEX "ProgrammeTemplateServiceRole_id_congregationId_key"           RENAME TO "TemplateServiceRole_id_congregationId_key";

ALTER INDEX "ProgrammePartAssignment_externalSpeakerId_idx"                RENAME TO "EventPart_externalSpeakerId_idx";
ALTER INDEX "ProgrammePartAssignment_id_congregationId_key"                RENAME TO "EventPart_id_congregationId_key";

ALTER INDEX "ProgrammeServiceRoleAssignment_id_congregationId_key"         RENAME TO "EventServiceRole_id_congregationId_key";

ALTER INDEX "ProgrammeTemplateResponsible_id_congregationId_key"           RENAME TO "TemplateResponsible_id_congregationId_key";
ALTER INDEX "ProgrammeTemplateResponsible_templateId_congregationId_key"   RENAME TO "TemplateResponsible_templateId_congregationId_key";

ALTER INDEX "ProgrammeTemplatePartAllowedRole_congregationId_idx"          RENAME TO "TemplatePartAllowedRole_congregationId_idx";
ALTER INDEX "ProgrammeTemplatePartAllowedRole_roleId_idx"                  RENAME TO "TemplatePartAllowedRole_roleId_idx";

ALTER INDEX "ProgrammePartAssignmentAllowedRole_congregationId_idx"        RENAME TO "EventPartAllowedRole_congregationId_idx";
ALTER INDEX "ProgrammePartAssignmentAllowedRole_roleId_idx"                RENAME TO "EventPartAllowedRole_roleId_idx";

ALTER INDEX "ProgrammeTemplateServiceRoleAllowedRole_congregationId_idx"   RENAME TO "TemplateServiceRoleAllowedRole_congregationId_idx";
ALTER INDEX "ProgrammeTemplateServiceRoleAllowedRole_roleId_idx"           RENAME TO "TemplateServiceRoleAllowedRole_roleId_idx";

ALTER INDEX "ProgrammeServiceRoleAssignmentAllowedRole_congregationId_idx" RENAME TO "EventServiceRoleAllowedRole_congregationId_idx";
ALTER INDEX "ProgrammeServiceRoleAssignmentAllowedRole_roleId_idx"         RENAME TO "EventServiceRoleAllowedRole_roleId_idx";

-- 5. Rewrite historical entityType strings so audit and notification
--    queries don't have to reason about both names forever.
UPDATE "AuditLog" SET "entityType" = 'EventTemplate'          WHERE "entityType" = 'ProgrammeTemplate';
UPDATE "AuditLog" SET "entityType" = 'TemplatePart'           WHERE "entityType" = 'ProgrammeTemplatePart';
UPDATE "AuditLog" SET "entityType" = 'TemplateServiceRole'    WHERE "entityType" = 'ProgrammeTemplateServiceRole';
UPDATE "AuditLog" SET "entityType" = 'EventPart'              WHERE "entityType" = 'ProgrammePartAssignment';
UPDATE "AuditLog" SET "entityType" = 'EventServiceRole'       WHERE "entityType" = 'ProgrammeServiceRoleAssignment';
UPDATE "AuditLog" SET "entityType" = 'TemplateResponsible'    WHERE "entityType" = 'ProgrammeTemplateResponsible';

UPDATE "NotificationEvent" SET "entityType" = 'EventPart'        WHERE "entityType" = 'ProgrammePartAssignment';
UPDATE "NotificationEvent" SET "entityType" = 'EventServiceRole' WHERE "entityType" = 'ProgrammeServiceRoleAssignment';
