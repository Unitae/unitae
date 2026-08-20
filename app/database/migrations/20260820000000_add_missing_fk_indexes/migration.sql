-- Index the foreign-key columns Postgres does not index automatically.
--
-- Postgres creates an index for a PRIMARY KEY / UNIQUE constraint but NOT for a
-- REFERENCES constraint. Every FK below was therefore unindexed, which costs twice:
--
--   1. Reads — `WHERE "eventId" = $1` (and every join through the FK) is a seq scan.
--   2. Deletes — an ON DELETE CASCADE / SET NULL FK makes Postgres scan the *child*
--      table once per deleted parent row to find dependents. Deleting one Event
--      scanned all of "EventPart" and "EventServicePart".
--
-- FKs whose column is already the LEADING column of a compound @@id/@@unique
-- (e.g. RolePermission.roleId under @@id([roleId, permissionId])) are deliberately
-- absent: that index already serves both access paths.
--
-- Plain CREATE INDEX (not CONCURRENTLY) because Prisma runs each migration inside a
-- transaction, which CONCURRENTLY forbids. These tables are per-congregation and
-- small; the brief write lock is acceptable. Revisit if any grows past ~1M rows.

-- CreateIndex
CREATE INDEX "BoardDocument_sectionId_idx" ON "BoardDocument"("sectionId");
-- CreateIndex
CREATE INDEX "BoardDocumentVersion_documentId_idx" ON "BoardDocumentVersion"("documentId");
-- CreateIndex
CREATE INDEX "BoardDynamicDocumentSettings_sectionId_idx" ON "BoardDynamicDocumentSettings"("sectionId");
-- CreateIndex
CREATE INDEX "BoardDynamicDocumentView_userId_idx" ON "BoardDynamicDocumentView"("userId");
-- CreateIndex
CREATE INDEX "BuildingAccess_entranceId_idx" ON "BuildingAccess"("entranceId");
-- CreateIndex
CREATE INDEX "BuildingResidentialData_entranceId_idx" ON "BuildingResidentialData"("entranceId");
-- CreateIndex
CREATE INDEX "CongregationUserPermission_permissionId_idx" ON "CongregationUserPermission"("permissionId");
-- CreateIndex
CREATE INDEX "ConsentRecord_userId_idx" ON "ConsentRecord"("userId");
-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
-- CreateIndex
CREATE INDEX "EventPart_eventId_idx" ON "EventPart"("eventId");
-- CreateIndex
CREATE INDEX "EventPart_partId_idx" ON "EventPart"("partId");
-- CreateIndex
CREATE INDEX "EventServicePart_eventId_idx" ON "EventServicePart"("eventId");
-- CreateIndex
CREATE INDEX "EventServicePart_servicePartId_idx" ON "EventServicePart"("servicePartId");
-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
-- CreateIndex
CREATE INDEX "TemplatePart_templateId_idx" ON "TemplatePart"("templateId");
-- CreateIndex
CREATE INDEX "TemplateServicePart_templateId_idx" ON "TemplateServicePart"("templateId");
