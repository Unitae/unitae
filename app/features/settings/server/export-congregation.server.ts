import type { Job } from 'bullmq'
import JsZip from 'jszip'
import { kindOfSlot, PART_ITEMS, SERVICE_ITEMS } from '~/features/events/index.server'
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
      // Written even when empty: a restore tells a newer archive by a file being there (archivedAbsenceEvents).
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
          select: {
            id: true,
            key: true,
            name: true,
            description: true,
            isBuiltIn: true,
            // Organigram. `parentRoleId` is a *source* id — the importer translates it through
            // the id map in a second pass, because target ids are assigned on insert.
            parentRoleId: true,
            showInOrganigram: true,
            organigramOrder: true,
            organigramNote: true,
            isSinglePerson: true,
          },
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
            arrivedAt: true,
            lastPastoralVisitAt: true,
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
            locale: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    },
    {
      name: 'user-role-assignments',
      export: () =>
        db.userRoleAssignment.findMany({
          // `kind` decides who leads a service. Dropping it on restore would quietly demote
          // every responsable to a plain member — a change in who may do what.
          select: { userId: true, roleId: true, kind: true },
        }),
    },
    {
      name: 'member-role-assignments',
      export: () =>
        db.memberRoleAssignment.findMany({
          // Since 2.12 the record also holds the roles given by hand, with their seat.
          select: { memberId: true, roleId: true, kind: true },
        }),
    },
    // No `congregation-user-permissions` entry: the direct user→permission edge
    // was dropped in #149. Everything it carried now travels as `roles`,
    // `role-permissions` and `user-role-assignments` above. The importer still
    // reads the old file so archives taken before that keep restoring.
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
            creditHours: true,
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
      // The PDF of each congregation's latest list stays out of the archive: it is a copy of what they sent.
      name: 'speaker-congregations',
      export: () =>
        db.speakerCongregation.findMany({
          select: {
            id: true,
            name: true,
            responsibleName: true,
            responsiblePhone: true,
            responsibleEmail: true,
            coordinatorName: true,
            coordinatorPhone: true,
            coordinatorEmail: true,
            listDate: true,
            notes: true,
            ourListSentAt: true,
            ourListSentManually: true,
            ourListSentDigest: true,
          },
        }),
    },
    {
      // Deleted speakers go too, nameless: imported programmes then still read « Orateur extérieur · <assemblée> ».
      name: 'external-speakers',
      export: () =>
        db.externalSpeaker.findMany({
          select: {
            id: true,
            name: true,
            congregationName: true,
            speakerCongregationId: true,
            phone: true,
            phone2: true,
            email: true,
            email2: true,
            notes: true,
            talks: true,
            archivedAt: true,
            anonymizedAt: true,
          },
        }),
    },
    {
      // « Notre liste »: what of each brother goes on the list we send, keyed to his record.
      name: 'our-speakers',
      export: () =>
        db.ourSpeaker.findMany({
          select: {
            memberId: true,
            onList: true,
            talks: true,
            phoneMode: true,
            phoneCustom: true,
            phone2: true,
            emailMode: true,
            emailCustom: true,
            email2: true,
            note: true,
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
      name: 'territory-kinds',
      export: () =>
        db.territoryKind.findMany({
          select: { id: true, key: true, name: true, isBuiltIn: true },
        }),
    },
    {
      name: 'territory-kind-allowed-roles',
      export: () =>
        db.territoryKindAllowedRole.findMany({
          select: { kindId: true, roleId: true },
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
            lastSeenInSourceAt: true,
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
      name: 'part-presets',
      export: () =>
        db.partPreset.findMany({
          select: {
            id: true,
            key: true,
            name: true,
            scope: true,
            hasReaderSlot: true,
            speakerLabel: true,
            readerLabel: true,
            allowExternalSpeaker: true,
            shareMessage: true,
            printsStudentSlip: true,
            isSystem: true,
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
            startTime: true,
            endTime: true,
            color: true,
            attendanceKind: true,
          },
        }),
    },
    {
      // Name or catalogue key, kind and responsible role of each schedule template (2.21).
      name: 'schedule-templates',
      export: () =>
        db.scheduleTemplate.findMany({
          select: { id: true, name: true, key: true, kind: true, responsibleRoleId: true },
          orderBy: { id: 'asc' },
        }),
    },
    {
      // Which schedule templates each template suggests, in order (2.21).
      name: 'kind-schedule-templates',
      export: () =>
        db.eventKindScheduleTemplate.findMany({
          select: { eventKindId: true, scheduleTemplateId: true, order: true },
          orderBy: [{ eventKindId: 'asc' }, { order: 'asc' }],
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
            presetId: true,
            scheduleTemplateId: true,
          },
        }),
    },
    {
      // A programme template's rooms, the main room by its key (2.22).
      name: 'schedule-template-rooms',
      export: () =>
        db.scheduleTemplateRoom.findMany({
          select: { id: true, name: true, key: true, order: true, scheduleTemplateId: true },
          orderBy: [{ scheduleTemplateId: 'asc' }, { order: 'asc' }, { id: 'asc' }],
        }),
    },
    {
      // The rooms each template part is held in (2.22).
      name: 'programme-template-part-rooms',
      export: () =>
        db.templatePartRoom.findMany({
          select: { templatePartId: true, roomId: true },
          orderBy: [{ templatePartId: 'asc' }, { roomId: 'asc' }],
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
          select: {
            id: true,
            name: true,
            key: true,
            order: true,
            templateId: true,
            presetId: true,
            scheduleTemplateId: true,
          },
          // In order: an import creates them in file order, so services sharing an order keep theirs.
          orderBy: [{ templateId: 'asc' }, { order: 'asc' }, { id: 'asc' }],
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
          select: { id: true, templateId: true, roleId: true, scope: true },
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
            status: true,
            origin: true,
          },
        }),
    },
    {
      // memberId is the person's record (null when the declaring account had none), accountId who declared it — the
      // owner when there is no record.
      name: 'absences',
      export: () =>
        db.absence.findMany({
          select: {
            id: true,
            startDate: true,
            endDate: true,
            note: true,
            memberId: true,
            accountId: true,
            createdAt: true,
          },
          orderBy: { id: 'asc' },
        }),
    },
    {
      name: 'attendance',
      export: () =>
        db.attendance.findMany({
          select: {
            eventId: true,
            inPerson: true,
            inPersonById: true,
            inPersonAt: true,
            online: true,
            onlineById: true,
            onlineAt: true,
          },
        }),
    },
    {
      // Each event's schedules, each with its own status (2.21).
      name: 'schedules',
      export: () =>
        db.schedule.findMany({
          select: {
            id: true,
            eventId: true,
            scheduleTemplateId: true,
            name: true,
            key: true,
            kind: true,
            order: true,
            status: true,
          },
          orderBy: [{ eventId: 'asc' }, { order: 'asc' }, { id: 'asc' }],
        }),
    },
    // The four item files keep their shape (plan T12): filled from items now that the writers write them, an item's
    // id standing for the old row's and its template item's legacy key for the template part or service. An importer
    // of any supported version reads them as before.
    {
      name: 'programme-part-assignments',
      export: async () => {
        const items = await db.item.findMany({
          where: PART_ITEMS,
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
            presetId: true,
            assigneeId: true,
            assistantId: true,
            allowExternalSpeaker: true,
            externalSpeakerId: true,
            scheduleId: true,
            templateItem: { select: { legacyPartId: true } },
          },
          orderBy: { id: 'asc' },
        })
        // In the file's own key order: `partId` after `eventId`, as the old rows' columns came.
        return items.map(({ templateItem, eventId, presetId, ...item }) => {
          const { assigneeId, assistantId, allowExternalSpeaker, externalSpeakerId, scheduleId, ...head } = item
          return {
            ...head,
            eventId,
            partId: templateItem?.legacyPartId ?? null,
            presetId,
            assigneeId,
            assistantId,
            allowExternalSpeaker,
            externalSpeakerId,
            scheduleId,
          }
        })
      },
    },
    {
      name: 'programme-part-assignment-allowed-roles',
      // `assignmentId` and `asKind` are the archive's frozen names: the item and its slot read back as the old kind.
      export: async () => {
        const rows = await db.itemAllowedRole.findMany({
          where: { item: PART_ITEMS },
          select: { itemId: true, roleId: true, slot: true },
        })
        return rows.map(r => ({ assignmentId: r.itemId, roleId: r.roleId, asKind: kindOfSlot(r.slot) }))
      },
    },
    {
      name: 'programme-service-role-assignments',
      export: async () => {
        const items = await db.item.findMany({
          where: SERVICE_ITEMS,
          select: {
            id: true,
            note: true,
            hasConflict: true,
            name: true,
            order: true,
            eventId: true,
            presetId: true,
            assigneeId: true,
            scheduleId: true,
            templateItem: { select: { legacyServiceId: true } },
          },
          orderBy: [{ eventId: 'asc' }, { order: 'asc' }, { id: 'asc' }],
        })
        return items.map(({ templateItem, presetId, assigneeId, scheduleId, ...head }) => ({
          ...head,
          servicePartId: templateItem?.legacyServiceId ?? null,
          presetId,
          assigneeId,
          scheduleId,
        }))
      },
    },
    {
      name: 'programme-service-role-assignment-allowed-roles',
      export: async () => {
        const rows = await db.itemAllowedRole.findMany({
          where: { item: SERVICE_ITEMS },
          select: { itemId: true, roleId: true },
        })
        return rows.map(r => ({ assignmentId: r.itemId, roleId: r.roleId }))
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
            appearance: true,
            dynamicConfig: true,
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
