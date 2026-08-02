import type { Job } from 'bullmq'
import JsZip from 'jszip'
import { EXPORT_PROGRESS_CAP } from '~/shared/constants/limits'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { type TransactionClient, withScope } from '~/shared/infra/db.server'
import { buildStorageKey, getFileBuffer, uploadFile } from '~/shared/infra/file-storage.server'
import { createLogger } from '~/shared/infra/logger.server'
import { ARCHIVE_VERSION, type ExportOptions, type ManifestJson } from './data-transfer.type'
import type { DataTransferJobData } from './data-transfer-queue.server'

const logger = createLogger('export-congregation')

type ExportJobData = Extract<DataTransferJobData, { type: 'export' }>

/**
 * Runs a full congregation export as a background job.
 * Returns the storage key of the generated .unitae archive.
 */
export async function runExport(job: Job<ExportJobData>): Promise<string> {
  const { congregationId, userId, options } = job.data
  await job.updateProgress(0)

  const zip = new JsZip()
  // biome-ignore lint/style/noNonNullAssertion: JsZip.folder() only returns null when called on a file entry, not a new folder
  const dataDir = zip.folder('data')!
  const entityCounts: Record<string, number> = {}

  await withScope(congregationId, async db => {
    const steps = buildExportSteps(db, congregationId, options)
    const totalSteps = steps.length + (options.includeFiles ? 1 : 0)
    let completedSteps = 0

    for (const step of steps) {
      const lines = await step.export()
      const ndjson = lines.map(line => JSON.stringify(line)).join('\n')
      dataDir.file(`${step.name}.ndjson`, ndjson + (lines.length > 0 ? '\n' : ''))
      entityCounts[step.name] = lines.length

      completedSteps++
      await job.updateProgress(Math.round((completedSteps / totalSteps) * EXPORT_PROGRESS_CAP))
    }

    if (options.includeFiles) {
      await exportFiles(zip, db, congregationId)
      completedSteps++
      await job.updateProgress(EXPORT_PROGRESS_CAP)
    }
  })

  const manifest: ManifestJson = {
    version: ARCHIVE_VERSION,
    exportDate: new Date().toISOString(),
    sourceApp: 'unitae',
    entityCounts,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const storageKey = buildStorageKey(congregationId, 'exports', `${job.id}.unitae`)
  await uploadFile(storageKey, buffer, 'application/zip')

  await job.updateProgress(100)

  audit({
    action: AuditAction.CongregationExported,
    congregationId,
    actorId: userId,
    entityType: 'Congregation',
    entityId: congregationId,
    metadata: { entityCounts, includeFiles: options.includeFiles, includeAuditLogs: options.includeAuditLogs },
  })

  logger.info(`Export completed for congregation ${congregationId}`, { storageKey, entityCounts })
  return storageKey
}

interface ExportStep {
  name: string
  export: () => Promise<Record<string, unknown>[]>
}

/** @internal Exported for integration testing only */
export function buildExportSteps(db: TransactionClient, congregationId: number, options: ExportOptions): ExportStep[] {
  const steps: ExportStep[] = [
    {
      name: 'congregation',
      export: async () => {
        const c = await db.congregation.findUniqueOrThrow({
          where: { id: congregationId },
          select: {
            name: true,
            slug: true,
            domain: true,
            displayName: true,
            emailFromName: true,
            emailFromAddress: true,
            baseUrl: true,
            locale: true,
            timezone: true,
          },
        })
        return [c]
      },
    },
    {
      name: 'settings',
      export: () =>
        db.setting.findMany({
          select: { key: true, value: true },
        }),
    },
    {
      name: 'roles',
      export: () =>
        db.role.findMany({
          select: { id: true, key: true, name: true, description: true, isBuiltIn: true },
        }),
    },
    {
      name: 'role-permissions',
      export: async () => {
        const grants = await db.rolePermission.findMany({
          select: {
            roleId: true,
            permission: { select: { key: true } },
          },
        })
        return grants.map(g => ({ roleId: g.roleId, permissionKey: g.permission.key }))
      },
    },
    {
      name: 'members',
      export: () =>
        db.member.findMany({
          select: {
            id: true,
            firstname: true,
            lastname: true,
            isPublisher: true,
            type: true,
            isMale: true,
            phone: true,
            address: true,
            email: true,
            birthDate: true,
            baptismDate: true,
            isHelder: true,
            isServant: true,
            isAnointed: true,
            dpaCardUpToDate: true,
            survivalBackpackReady: true,
            leftAt: true,
            inactiveAt: true,
            anonymizedAt: true,
            publisherGroupId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    },
    {
      name: 'user-accounts',
      export: () =>
        db.userAccount.findMany({
          select: {
            id: true,
            memberId: true,
            firstname: true,
            lastname: true,
            email: true,
            active: true,
            emailVerifiedAt: true,
            platformAdmin: true,
            anonymizedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    },
    {
      name: 'user-role-assignments',
      export: () =>
        db.userRoleAssignment.findMany({
          select: { userId: true, roleId: true },
        }),
    },
    {
      name: 'member-role-assignments',
      export: () =>
        db.memberRoleAssignment.findMany({
          select: { memberId: true, roleId: true },
        }),
    },
    {
      name: 'congregation-user-permissions',
      export: async () => {
        const permissions = await db.congregationUserPermission.findMany({
          select: {
            userId: true,
            permission: { select: { key: true } },
          },
        })
        return permissions.map(p => ({ userId: p.userId, permissionKey: p.permission.key }))
      },
    },
    {
      name: 'publisher-groups',
      export: () =>
        db.publisherGroup.findMany({
          select: {
            id: true,
            name: true,
            adress: true,
            responsibleId: true,
            deputyId: true,
          },
        }),
    },
    {
      name: 'publisher-activities',
      export: () =>
        db.publisherActivity.findMany({
          select: {
            id: true,
            month: true,
            year: true,
            publisherId: true,
            hours: true,
            studies: true,
            type: true,
            isPublisher: true,
            notes: true,
          },
        }),
    },
    {
      name: 'pioneer-enrolments',
      export: () =>
        db.pioneerEnrolment.findMany({
          select: {
            id: true,
            memberId: true,
            type: true,
            startMonth: true,
            startYear: true,
            endMonth: true,
            endYear: true,
            monthlyGoal: true,
          },
        }),
    },
    {
      name: 'emergency-contacts',
      export: () =>
        db.emergencyContact.findMany({
          select: {
            id: true,
            memberId: true,
            name: true,
            relationship: true,
            phone: true,
          },
        }),
    },
    {
      name: 'pioneer-goals',
      // Congregation-scoped, no cross-entity references: the natural key is
      // (serviceYear, type, congregationId). Ids are not exported — the importer
      // upserts on that key (congregationId comes from the import scope).
      export: () =>
        db.pioneerGoal.findMany({
          select: {
            serviceYear: true,
            type: true,
            monthlyHours: true,
          },
        }),
    },
    {
      name: 'external-speakers',
      export: () =>
        db.externalSpeaker.findMany({
          select: {
            id: true,
            name: true,
            congregationName: true,
            phone: true,
            email: true,
            notes: true,
            archivedAt: true,
          },
        }),
    },
    {
      name: 'territories',
      export: () =>
        db.territory.findMany({
          select: { id: true, number: true, type: true, notes: true },
        }),
    },
    {
      name: 'territory-card-overlays',
      export: () =>
        db.territoryCardOverlay.findMany({
          select: { id: true, name: true, color: true, paths: true },
        }),
    },
    {
      name: 'territory-perimeter',
      export: () =>
        db.territoryPerimeter.findMany({
          select: { paths: true },
        }),
    },
    {
      name: 'buildings',
      export: () =>
        db.building.findMany({
          select: {
            id: true,
            number: true,
            street: true,
            zip: true,
            latitude: true,
            longitude: true,
            active: true,
            inTerritory: true,
            inOpenData: true,
            prospectionDate: true,
            notes: true,
            importantNotes: true,
          },
        }),
    },
    {
      name: 'building-entrances',
      export: () =>
        db.buildingEntrance.findMany({
          select: {
            id: true,
            kind: true,
            shopKind: true,
            homes: true,
            phones: true,
            liberals: true,
            access: true,
            isPMR: true,
            isOpenEarly: true,
            isMailboxOpen: true,
            notes: true,
          },
        }),
    },
    {
      name: 'building-accesses',
      export: () =>
        db.buildingAccess.findMany({
          select: { id: true, entranceId: true, type: true, position: true },
        }),
    },
    {
      name: 'building-residential-data',
      export: () =>
        db.buildingResidentialData.findMany({
          select: { id: true, buildingId: true, entranceId: true, homes: true, phones: true, liberals: true },
        }),
    },
    {
      name: 'territory-entrance-links',
      export: async () => {
        const territories = await db.territory.findMany({
          select: { id: true, entrances: { select: { id: true } } },
        })
        const links: { territoryId: number; entranceId: number }[] = []
        for (const t of territories) {
          for (const e of t.entrances) {
            links.push({ territoryId: t.id, entranceId: e.id })
          }
        }
        return links
      },
    },
    {
      name: 'building-entrance-links',
      export: async () => {
        const buildings = await db.building.findMany({
          select: { id: true, entrances: { select: { id: true } } },
        })
        const links: { buildingId: number; entranceId: number }[] = []
        for (const b of buildings) {
          for (const e of b.entrances) {
            links.push({ buildingId: b.id, entranceId: e.id })
          }
        }
        return links
      },
    },
    {
      name: 'attributions',
      export: () =>
        db.attribution.findMany({
          select: {
            id: true,
            type: true,
            publisherId: true,
            territoryId: true,
            startDate: true,
            endDate: true,
            lateDate: true,
            notes: true,
          },
        }),
    },
    {
      name: 'programme-templates',
      export: () =>
        db.eventTemplate.findMany({
          select: {
            id: true,
            name: true,
            key: true,
            description: true,
            weekDay: true,
            isRecurring: true,
            color: true,
          },
        }),
    },
    {
      name: 'programme-template-parts',
      export: () =>
        db.templatePart.findMany({
          select: {
            id: true,
            name: true,
            section: true,
            track: true,
            trackOrder: true,
            order: true,
            durationMin: true,
            allowExternalSpeaker: true,
            templateId: true,
          },
        }),
    },
    {
      name: 'programme-template-part-allowed-roles',
      export: () =>
        db.templatePartAllowedRole.findMany({
          select: { partId: true, roleId: true, asKind: true },
        }),
    },
    {
      name: 'programme-template-service-roles',
      export: () =>
        db.templateServicePart.findMany({
          select: { id: true, name: true, key: true, templateId: true },
        }),
    },
    {
      name: 'programme-template-service-role-allowed-roles',
      export: () =>
        db.templateServicePartAllowedRole.findMany({
          select: { servicePartId: true, roleId: true },
        }),
    },
    {
      name: 'programme-template-responsibles',
      export: () =>
        db.templateResponsible.findMany({
          select: { id: true, templateId: true, userId: true },
        }),
    },
    {
      name: 'events',
      export: () =>
        db.event.findMany({
          select: {
            id: true,
            name: true,
            description: true,
            startDate: true,
            endDate: true,
            templateId: true,
            createdById: true,
            createdAt: true,
          },
        }),
    },
    {
      name: 'programme-part-assignments',
      export: () =>
        db.eventPart.findMany({
          select: {
            id: true,
            topic: true,
            note: true,
            hasConflict: true,
            name: true,
            section: true,
            track: true,
            trackOrder: true,
            order: true,
            durationMin: true,
            eventId: true,
            partId: true,
            assigneeId: true,
            assistantId: true,
            allowExternalSpeaker: true,
            externalSpeakerId: true,
          },
        }),
    },
    {
      name: 'programme-part-assignment-allowed-roles',
      // Renaming `eventPartId` back to `assignmentId` on write keeps the NDJSON
      // format stable for pre-2.1 importers — the column was renamed in the
      // 20260720400000 migration, but the archive schema stays frozen.
      export: async () => {
        const rows = await db.eventPartAllowedRole.findMany({
          select: { eventPartId: true, roleId: true, asKind: true },
        })
        return rows.map(r => ({ assignmentId: r.eventPartId, roleId: r.roleId, asKind: r.asKind }))
      },
    },
    {
      name: 'programme-service-role-assignments',
      export: () =>
        db.eventServicePart.findMany({
          select: {
            id: true,
            note: true,
            hasConflict: true,
            name: true,
            eventId: true,
            servicePartId: true,
            assigneeId: true,
          },
        }),
    },
    {
      name: 'programme-service-role-assignment-allowed-roles',
      // See comment on programme-part-assignment-allowed-roles above — archive
      // field name stays `assignmentId` even after the column rename.
      export: async () => {
        const rows = await db.eventServicePartAllowedRole.findMany({
          select: { eventServicePartId: true, roleId: true },
        })
        return rows.map(r => ({ assignmentId: r.eventServicePartId, roleId: r.roleId }))
      },
    },
    {
      name: 'board-sections',
      export: () =>
        db.boardSection.findMany({
          select: { id: true, name: true, order: true },
        }),
    },
    {
      name: 'board-section-visibility-roles',
      export: () =>
        db.boardSectionVisibilityRole.findMany({
          select: { sectionId: true, roleId: true },
        }),
    },
    {
      name: 'board-documents',
      export: () =>
        db.boardDocument.findMany({
          select: {
            id: true,
            title: true,
            uri: true,
            thumbnailUri: true,
            sectionId: true,
            order: true,
            type: true,
            visibleFrom: true,
            visibleUntil: true,
            isHighlighted: true,
            createdAt: true,
          },
        }),
    },
    {
      name: 'board-document-versions',
      export: () =>
        db.boardDocumentVersion.findMany({
          select: {
            id: true,
            documentId: true,
            uri: true,
            thumbnailUri: true,
            versionNumber: true,
            uploadedById: true,
            createdAt: true,
          },
        }),
    },
    {
      name: 'board-dynamic-document-settings',
      export: () =>
        db.boardDynamicDocumentSettings.findMany({
          select: {
            id: true,
            title: true,
            dynamicType: true,
            dynamicRef: true,
            sectionId: true,
            order: true,
            visibleFrom: true,
            visibleUntil: true,
            isHighlighted: true,
            showServices: true,
          },
        }),
    },
    {
      name: 'consent-records',
      export: () =>
        db.consentRecord.findMany({
          select: {
            id: true,
            purpose: true,
            consentedAt: true,
            withdrawnAt: true,
            consentVersion: true,
            ipAddress: true,
            userId: true,
          },
        }),
    },
  ]

  if (options.includeAuditLogs) {
    steps.push(
      {
        name: 'audit-logs',
        export: () =>
          db.auditLog.findMany({
            select: {
              id: true,
              action: true,
              entityType: true,
              entityId: true,
              actorId: true,
              actorEmail: true,
              metadata: true,
              createdAt: true,
            },
          }),
      },
      {
        name: 'data-deletion-records',
        export: () =>
          db.dataDeletionRecord.findMany({
            select: {
              id: true,
              entityType: true,
              entityId: true,
              requestedBy: true,
              requestedAt: true,
              completedAt: true,
            },
          }),
      },
    )
  }

  return steps
}

async function exportFiles(zip: JsZip, db: TransactionClient, congregationId: number): Promise<void> {
  // biome-ignore lint/style/noNonNullAssertion: JsZip.folder() only returns null on file entries
  const filesDir = zip.folder('files')!.folder('board')!

  const documents = await db.boardDocument.findMany({
    select: { uri: true, thumbnailUri: true },
  })
  const versions = await db.boardDocumentVersion.findMany({
    select: { uri: true, thumbnailUri: true },
  })

  const uris = new Set<string>()
  for (const doc of documents) {
    if (doc.uri) uris.add(doc.uri)
    if (doc.thumbnailUri) uris.add(doc.thumbnailUri)
  }
  for (const ver of versions) {
    if (ver.uri) uris.add(ver.uri)
    if (ver.thumbnailUri) uris.add(ver.thumbnailUri)
  }

  for (const uri of uris) {
    const buffer = await getFileBuffer(uri)
    if (buffer) {
      // Store using just the filename part (strip the congregationId/board/ prefix)
      // biome-ignore lint/style/noNonNullAssertion: split('/') always returns at least one element
      const filename = uri.split('/').pop()!
      filesDir.file(filename, buffer)
    } else {
      logger.warn(`File not found in storage during export: ${uri}`, { congregationId })
    }
  }
}
