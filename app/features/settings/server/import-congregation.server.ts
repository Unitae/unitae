import type { Job } from 'bullmq'
import JsZip from 'jszip'
import { backfillCongregationEnrolments } from '~/features/publishers/index.server'
import {
  IMPORT_PROGRESS_CAP,
  IMPORT_TOTAL_STEPS,
  IMPORT_TX_MAX_WAIT_MS,
  IMPORT_TX_TIMEOUT_MS,
} from '~/shared/constants/limits'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { unscopedDb, withScope } from '~/shared/infra/db.server'
import { getFileBuffer } from '~/shared/infra/file-storage.server'
import { createLogger } from '~/shared/infra/logger.server'
import { EntityIdMap } from './data-transfer.type'
import type { DataTransferJobData } from './data-transfer-queue.server'
import { importAuditLogs, importConsentRecords, importDataDeletionRecords } from './import-audit-consent.server'
import {
  importBoardDocuments,
  importBoardDocumentVersions,
  importBoardDynamicDocumentSettings,
  importBoardSections,
  importBoardSectionVisibilityRoles,
} from './import-board.server'
import {
  importBuildingAccesses,
  importBuildingEntranceLinks,
  importBuildingEntrances,
  importBuildingResidentialData,
  importBuildings,
  importTerritoryEntranceLinks,
} from './import-buildings.server'
import { importRolePermissions, importRoles, importSettings } from './import-configuration.server'
import {
  importEventTemplates,
  importTemplatePartAllowedRoles,
  importTemplateParts,
  importTemplateResponsibles,
  importTemplateServicePartAllowedRoles,
  importTemplateServiceParts,
} from './import-event-templates.server'
import {
  importEventPartAllowedRoles,
  importEventParts,
  importEventServicePartAllowedRoles,
  importEventServiceParts,
  importEvents,
} from './import-events.server'
import {
  importEmergencyContacts,
  importExternalSpeakers,
  importPioneerEnrolments,
  importPioneerGoals,
  importPublisherActivities,
  importPublisherGroups,
  updateMemberPublisherGroups,
} from './import-publishers.server'
import {
  importAttributions,
  importTerritories,
  importTerritoryCardOverlays,
  importTerritoryPerimeter,
} from './import-territories.server'
import {
  importCongregationUserPermissions,
  importMembers,
  importUserAccounts,
  importUserRoleAssignments,
} from './import-user-accounts.server'
import { migrateLegacyUsersNdjson } from './migrate-legacy-users-ndjson.server'
import { readManifest } from './ndjson-archive'

// Per-entity import functions re-exported so integration tests (and any future
// per-module test suites) keep a single stable import surface.
export {
  importAuditLogs,
  importConsentRecords,
  importDataDeletionRecords,
} from './import-audit-consent.server'
export {
  importBoardDocuments,
  importBoardDocumentVersions,
  importBoardDynamicDocumentSettings,
  importBoardFile,
  importBoardSections,
  importBoardSectionVisibilityRoles,
} from './import-board.server'
export {
  importBuildingAccesses,
  importBuildingEntranceLinks,
  importBuildingEntrances,
  importBuildingResidentialData,
  importBuildings,
  importTerritoryEntranceLinks,
} from './import-buildings.server'
export { importRolePermissions, importRoles, importSettings } from './import-configuration.server'
export {
  importEventTemplates,
  importTemplatePartAllowedRoles,
  importTemplateParts,
  importTemplateResponsibles,
  importTemplateServicePartAllowedRoles,
  importTemplateServiceParts,
} from './import-event-templates.server'
export {
  importEventPartAllowedRoles,
  importEventParts,
  importEventServicePartAllowedRoles,
  importEventServiceParts,
  importEvents,
} from './import-events.server'
export {
  importEmergencyContacts,
  importExternalSpeakers,
  importPioneerEnrolments,
  importPioneerGoals,
  importPublisherActivities,
  importPublisherGroups,
  updateMemberPublisherGroups,
} from './import-publishers.server'
export {
  importAttributions,
  importTerritories,
  importTerritoryCardOverlays,
  importTerritoryPerimeter,
} from './import-territories.server'
export {
  importCongregationUserPermissions,
  importMembers,
  importUserAccounts,
  importUserRoleAssignments,
} from './import-user-accounts.server'
export { migrateLegacyUsersNdjson } from './migrate-legacy-users-ndjson.server'
export { validateImport } from './validate-congregation-import.server'

const logger = createLogger('import-congregation')

type ImportJobData = Extract<DataTransferJobData, { type: 'import' }>

/**
 * Runs a full congregation import as a background job.
 */
export async function runImport(job: Job<ImportJobData>): Promise<void> {
  const { congregationId, userId, storageKey } = job.data
  await job.updateProgress(0)

  const buffer = await getFileBuffer(storageKey)
  if (!buffer) {
    throw new Error('Archive file not found')
  }

  const zip = await JsZip.loadAsync(buffer)
  const manifest = await readManifest(zip)

  // v1.x → v2.0 shim: split legacy users.ndjson into members + user-accounts
  // so the rest of runImport reads the v2.0 layout. Idempotent if the
  // archive is already v2.0.
  const shimWarnings = await migrateLegacyUsersNdjson(zip, manifest.version)
  if (shimWarnings.length > 0) {
    logger.info(`Imported legacy v${manifest.version} archive`, { congregationId, warnings: shimWarnings })
  }

  const idMap = new EntityIdMap()

  // Resolve global Permission keys -> ids upfront (these are shared, not per-congregation)
  const allPermissions = await unscopedDb.permission.findMany({ select: { id: true, key: true } })
  const permissionKeyToId = new Map(allPermissions.map(p => [p.key, p.id]))

  // Imports write thousands of rows in one atomic transaction — well past Prisma's
  // 5s default. Bump to 10 minutes; also raise maxWait so we don't fail to acquire
  // a pool connection on a busy instance.
  const importTransactionOptions = { timeout: IMPORT_TX_TIMEOUT_MS, maxWait: IMPORT_TX_MAX_WAIT_MS }

  await withScope(
    congregationId,
    async db => {
      let step = 0

      const progress = async () => {
        step++
        await job.updateProgress(Math.round((step / IMPORT_TOTAL_STEPS) * IMPORT_PROGRESS_CAP))
      }

      await importSettings(zip, db, congregationId)
      await progress()

      await importRoles(zip, db, idMap, congregationId)
      await progress()

      await importRolePermissions(zip, db, idMap, permissionKeyToId, congregationId)
      await progress()

      await importMembers(zip, db, idMap, congregationId)
      await importUserAccounts(zip, db, idMap, congregationId)
      await progress()

      await importUserRoleAssignments(zip, db, idMap, congregationId)
      await progress()

      await importCongregationUserPermissions(zip, db, idMap, permissionKeyToId, congregationId)
      await progress()

      await importPublisherGroups(zip, db, idMap, congregationId)
      await progress()

      await updateMemberPublisherGroups(zip, db, idMap, congregationId)
      await progress()

      await importPublisherActivities(zip, db, idMap, congregationId)
      await progress()

      await importPioneerEnrolments(zip, db, idMap, congregationId)
      await progress()

      await importEmergencyContacts(zip, db, idMap, congregationId)
      await progress()

      await importPioneerGoals(zip, db, congregationId)
      await progress()

      await importExternalSpeakers(zip, db, idMap, congregationId)
      await progress()

      await importTerritories(zip, db, idMap, congregationId)
      await progress()

      await importTerritoryCardOverlays(zip, db, idMap, congregationId)
      await progress()

      await importTerritoryPerimeter(zip, db, congregationId)
      await progress()

      await importBuildings(zip, db, idMap, congregationId)
      await progress()

      await importBuildingEntrances(zip, db, idMap, congregationId)
      await progress()

      await importBuildingAccesses(zip, db, idMap, congregationId)
      await progress()

      await importBuildingResidentialData(zip, db, idMap, congregationId)
      await progress()

      await importTerritoryEntranceLinks(zip, db, idMap, congregationId)
      await progress()

      await importBuildingEntranceLinks(zip, db, idMap, congregationId)
      await progress()

      await importAttributions(zip, db, idMap, congregationId)
      await progress()

      await importEventTemplates(zip, db, idMap, congregationId)
      await progress()

      await importTemplateParts(zip, db, idMap, congregationId)
      await progress()

      await importTemplatePartAllowedRoles(zip, db, idMap, congregationId)
      await progress()

      await importTemplateServiceParts(zip, db, idMap, congregationId)
      await progress()

      await importTemplateServicePartAllowedRoles(zip, db, idMap, congregationId)
      await progress()

      await importTemplateResponsibles(zip, db, idMap, congregationId)
      await progress()

      await importEvents(zip, db, idMap, congregationId)
      await progress()

      await importEventParts(zip, db, idMap, congregationId)
      await progress()

      await importEventPartAllowedRoles(zip, db, idMap, congregationId)
      await progress()

      await importEventServiceParts(zip, db, idMap, congregationId)
      await progress()

      await importEventServicePartAllowedRoles(zip, db, idMap, congregationId)
      await progress()

      await importBoardSections(zip, db, idMap, congregationId)
      await progress()

      await importBoardSectionVisibilityRoles(zip, db, idMap, congregationId)
      await progress()

      await importBoardDocuments(zip, db, idMap, congregationId)
      await progress()

      await importBoardDocumentVersions(zip, db, idMap, congregationId)
      await progress()

      await importBoardDynamicDocumentSettings(zip, db, idMap, congregationId)
      await progress()

      await importConsentRecords(zip, db, idMap, congregationId)
      await progress()

      // Optional: audit logs
      await importAuditLogs(zip, db, idMap, congregationId)

      // Optional: data deletion records
      await importDataDeletionRecords(zip, db, congregationId)

      // Ensure every member with pioneer activity has enrolments: v2.3+ archives imported them above;
      // pre-2.3 archives have none, so backfill from the imported activity history (§6.1). Idempotent —
      // members that already have enrolments are skipped, so this is a no-op for new archives.
      await backfillCongregationEnrolments(db, congregationId, userId)
    },
    importTransactionOptions,
  )

  await job.updateProgress(100)

  audit({
    action: AuditAction.CongregationImported,
    congregationId,
    actorId: userId,
    entityType: 'Congregation',
    entityId: congregationId,
    metadata: { storageKey },
  })

  logger.info(`Import completed for congregation ${congregationId}`)
}
