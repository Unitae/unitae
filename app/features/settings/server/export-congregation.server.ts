import type { Job } from 'bullmq'
import JsZip from 'jszip'
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
      await job.updateProgress(Math.round((completedSteps / totalSteps) * 90))
    }

    if (options.includeFiles) {
      await exportFiles(zip, db, congregationId)
      completedSteps++
      await job.updateProgress(90)
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
      name: 'event-kinds',
      export: () =>
        db.eventKind.findMany({
          select: { id: true, name: true, key: true, color: true, weekDay: true },
        }),
    },
    {
      name: 'users',
      export: () =>
        db.user.findMany({
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            active: true,
            isPublisher: true,
            type: true,
            isMale: true,
            phone: true,
            address: true,
            birthDate: true,
            baptismDate: true,
            isHelder: true,
            isServant: true,
            isAnointed: true,
            anonymizedAt: true,
            publisherGroupId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    },
    {
      name: 'congregation-user-roles',
      export: async () => {
        const roles = await db.congregationUserRole.findMany({
          select: {
            userId: true,
            role: { select: { key: true } },
          },
        })
        return roles.map(r => ({ userId: r.userId, roleKey: r.role.key }))
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
      name: 'territories',
      export: () =>
        db.territory.findMany({
          select: { id: true, number: true, type: true, notes: true },
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
            // biome-ignore lint/style/useNamingConvention: Prisma field name
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
        db.programmeTemplate.findMany({
          select: { id: true, name: true, key: true, description: true, weekDay: true, isRecurring: true },
        }),
    },
    {
      name: 'programme-template-parts',
      export: () =>
        db.programmeTemplatePart.findMany({
          select: {
            id: true,
            name: true,
            section: true,
            track: true,
            order: true,
            durationMin: true,
            isVariable: true,
            templateId: true,
          },
        }),
    },
    {
      name: 'programme-template-service-roles',
      export: () =>
        db.programmeTemplateServiceRole.findMany({
          select: { id: true, name: true, key: true, templateId: true },
        }),
    },
    {
      name: 'programme-template-responsibles',
      export: () =>
        db.programmeTemplateResponsible.findMany({
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
            kindId: true,
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
        db.programmePartAssignment.findMany({
          select: {
            id: true,
            topic: true,
            note: true,
            hasConflict: true,
            name: true,
            section: true,
            track: true,
            order: true,
            durationMin: true,
            eventId: true,
            partId: true,
            assigneeId: true,
            assistantId: true,
          },
        }),
    },
    {
      name: 'programme-service-role-assignments',
      export: () =>
        db.programmeServiceRoleAssignment.findMany({
          select: {
            id: true,
            note: true,
            hasConflict: true,
            name: true,
            eventId: true,
            serviceRoleId: true,
            assigneeId: true,
          },
        }),
    },
    {
      name: 'board-sections',
      export: () =>
        db.boardSection.findMany({
          select: { id: true, name: true, order: true },
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
  const filesDir = zip.folder('files')?.folder('board')!

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
      const filename = uri.split('/').pop()!
      filesDir.file(filename, buffer)
    } else {
      logger.warn(`File not found in storage during export: ${uri}`, { congregationId })
    }
  }
}
