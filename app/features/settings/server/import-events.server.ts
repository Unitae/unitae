import type JsZip from 'jszip'
import { EventOrigin, EventStatus, EventTemplateKey, isEventOrigin } from '~/features/events'
import { EMPTY_MEETING } from '~/features/events/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { EntityIdMap } from './data-transfer.type'
import { archivedAbsenceEvents } from './import-absences.server'
import { scheduleOfItem } from './import-schedules.server'
import { fallbackServiceOrders, readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-events')

/**
 * Events. An event whose author is not in the archive (or was skipped) keeps going without one, as the events the
 * recurring-events job creates do.
 *
 * An archive from before the day-off events were dropped still has them: they are not restored, only their absences —
 * from the absences file (2.19 on), or from the day-off's author when the file does not cover it. One the file does not
 * cover and whose author did not come is skipped and counted: nothing else says whose it is, so its absence is lost.
 *
 * A fresh congregation already has its first two months of empty meetings from seeding: the archive's meetings replace
 * them, and the recurring-events job starts again after the last imported one.
 *
 * Each event keeps its status from v2.16 on; an archive without one, or with a status this version does not know,
 * imports it as a draft — the latter said in the log.
 */
export async function importEvents(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<number[]> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    description: string
    startDate: string
    endDate: string
    templateId: number | null
    createdById: number | null
    createdAt: string
    // Since v2.16.
    status?: string
    // Since v2.18.
    origin?: string
  }>(zip, 'events')
  if (records.length === 0) return []

  // The archive's own day-off templates (an archive from before the day-off events were dropped): their events are
  // absences, restored as Absence rows only — the template is not restored either (importEventTemplates).
  const dayOffTemplates = new Set(
    (await readNdjsonFile<{ id: number; key: string }>(zip, 'programme-templates'))
      .filter(template => template.key === EventTemplateKey.DayOff)
      .map(template => template.id),
  )
  // A fresh congregation already has empty meetings from seeding, on the seeded weekdays. The archive's meetings
  // replace them all — never one with attendance — and every template's mark is reset, so the recurring-events job
  // starts again after the last imported meeting, on the archive's own weekdays.
  await db.event.deleteMany({
    where: { congregationId, ...EMPTY_MEETING },
  })
  await db.eventTemplate.updateMany({ where: { congregationId }, data: { generatedUntil: null } })

  // From 2.19 the absences come from their own file (importAbsences); a day-off it does not cover, and every day-off of
  // an older archive, gets its absence from its author.
  const coveredDayOffs = await archivedAbsenceEvents(zip)
  let rebuilt = 0
  let ownerless = 0
  let unknownStatus = 0
  // Restored from an archive without origins (before v2.18): settleImportedEventOrigins decides them once their parts,
  // services and counts are in. One whose origin this version does not know stays « import ».
  let unknownOrigin = 0
  const withoutOrigin: number[] = []
  const recordOf = new Map<number, number | null>()
  for (const record of records) {
    const templateId = idMap.getOptional('programme-templates', record.templateId)
    const createdById = idMap.getOptional('user-accounts', record.createdById)
    if (record.templateId != null && dayOffTemplates.has(record.templateId)) {
      // A day-off: its absence comes from the absences file when the archive has one that covers it, else from its
      // author — nothing else says whose it is.
      if (coveredDayOffs?.covers(record.id)) continue
      if (createdById == null) {
        ownerless++
        continue
      }
      if (coveredDayOffs != null) rebuilt++
      await writeAbsenceOf(db, { accountId: createdById, record, congregationId }, recordOf)
      continue
    }

    const startDate = new Date(record.startDate)
    const created = await db.event.create({
      data: {
        name: record.name,
        description: record.description,
        startDate,
        endDate: new Date(record.endDate),
        templateId,
        createdById,
        status: importedStatus(record.status, () => unknownStatus++),
        origin: isEventOrigin(record.origin) ? record.origin : EventOrigin.Import,
        congregationId,
      },
    })
    idMap.set('events', record.id, created.id)
    if (record.origin == null) withoutOrigin.push(created.id)
    else if (!isEventOrigin(record.origin)) unknownOrigin++
  }
  if (unknownOrigin > 0) {
    logger.warn(`Imported ${unknownOrigin} event(s) with an unknown origin as restored`, { congregationId })
  }
  if (unknownStatus > 0) {
    logger.warn(`Imported ${unknownStatus} event(s) with an unknown status as drafts`, { congregationId })
  }
  if (ownerless > 0) {
    // Counted only when nothing else had them: the absences file did not cover these day-offs.
    logger.warn(`Skipped ${ownerless} absence(s) whose owner was not imported`, { congregationId })
  }
  if (rebuilt > 0) {
    logger.warn(`Rebuilt ${rebuilt} absence(s) from day-off events the absences file did not carry`, { congregationId })
  }
  return withoutOrigin
}

/**
 * A restored absence's Absence row from its archived day-off event — for an archive before 2.19, or a day-off its
 * absences file does not cover: its owner's record when the restored account has one, as the migration does. The event
 * itself is not restored. `recordOf` keeps each account's record once looked up.
 */
async function writeAbsenceOf(
  db: TransactionClient,
  {
    accountId,
    record,
    congregationId,
  }: {
    accountId: number
    record: { startDate: string; endDate: string; description: string; createdAt: string }
    congregationId: number
  },
  recordOf: Map<number, number | null>,
): Promise<void> {
  if (!recordOf.has(accountId)) {
    // Restored earlier in the same import: missing, the restore is broken — fail rather than mis-own the absence.
    const account = await db.userAccount.findFirstOrThrow({
      where: { id: accountId, congregationId },
      select: { memberId: true },
    })
    recordOf.set(accountId, account.memberId)
  }
  await db.absence.create({
    data: {
      startDate: new Date(record.startDate),
      endDate: new Date(record.endDate),
      note: record.description ?? '',
      memberId: recordOf.get(accountId) ?? null,
      accountId,
      createdAt: new Date(record.createdAt),
      congregationId,
    },
  })
}

/**
 * The origin of events an archive did not give one (before v2.18), by the migration's rule, once their parts, services
 * and counts are in: one without an author and with nothing on it was an empty meeting, the job's — it still moves with
 * its template. The others stay « import ».
 */
export async function settleImportedEventOrigins(
  db: TransactionClient,
  eventIds: number[],
  congregationId: number,
): Promise<void> {
  if (eventIds.length === 0) return
  await db.event.updateMany({
    where: {
      id: { in: eventIds },
      congregationId,
      origin: EventOrigin.Import,
      createdById: null,
      eventParts: { none: {} },
      eventServiceParts: { none: {} },
      attendance: { is: null },
    },
    data: { origin: EventOrigin.Job },
  })
}

/** The status an event takes: the archive's when this version knows it, a draft otherwise. */
function importedStatus(status: string | undefined, onUnknown: () => void): string {
  if (status === EventStatus.Released || status === EventStatus.Draft) return status
  if (status != null) onUnknown()
  return EventStatus.Draft
}

export async function importEventParts(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    topic: string
    note: string
    hasConflict: boolean
    name: string
    section: string
    track: string
    trackOrder?: number | null
    order: number
    durationMin: number | null
    eventId: number
    partId: number | null
    presetId?: number | null
    assigneeId: number | null
    assistantId: number | null
    allowExternalSpeaker?: boolean
    externalSpeakerId?: number | null
    scheduleId?: number | null
  }>(zip, 'programme-part-assignments')

  for (const record of records) {
    const eventId = idMap.getOptional('events', record.eventId)
    if (!eventId) continue

    const created = await db.eventPart.create({
      data: {
        topic: record.topic,
        note: record.note,
        hasConflict: record.hasConflict,
        name: record.name,
        section: record.section,
        track: record.track,
        trackOrder: record.trackOrder ?? null,
        order: record.order,
        durationMin: record.durationMin,
        eventId,
        partId: idMap.getOptional('programme-template-parts', record.partId),
        // Absent in pre-2.5 archives, which resolves to null — the part simply
        // arrives with no kind, as it would before the backfill runs.
        presetId: idMap.getOptional('part-presets', record.presetId),
        assigneeId: idMap.getOptional('members', record.assigneeId),
        assistantId: idMap.getOptional('members', record.assistantId),
        allowExternalSpeaker: record.allowExternalSpeaker ?? false,
        externalSpeakerId: idMap.getOptional('external-speakers', record.externalSpeakerId),
        // Null before 2.21, or when its schedule did not come or is not one of this event's programmes:
        // settleImportedSchedules gives it one.
        scheduleId: scheduleOfItem(idMap, record.scheduleId, eventId, 'programme'),
        congregationId,
      },
    })
    idMap.set('programme-part-assignments', record.id, created.id)
  }
}

export async function importEventServiceParts(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    note: string
    hasConflict: boolean
    name: string
    eventId: number
    servicePartId: number | null
    presetId?: number | null
    assigneeId: number | null
    order?: number
    scheduleId?: number | null
  }>(zip, 'programme-service-role-assignments')

  const fallback = fallbackServiceOrders(records, record => record.eventId)
  for (const record of records) {
    const eventId = idMap.getOptional('events', record.eventId)
    if (!eventId) continue

    const created = await db.eventServicePart.create({
      data: {
        note: record.note,
        hasConflict: record.hasConflict,
        name: record.name,
        order: record.order ?? fallback.get(record.id) ?? 0,
        eventId,
        servicePartId: idMap.getOptional('programme-template-service-roles', record.servicePartId),
        presetId: idMap.getOptional('part-presets', record.presetId),
        assigneeId: idMap.getOptional('members', record.assigneeId),
        scheduleId: scheduleOfItem(idMap, record.scheduleId, eventId, 'duty'),
        congregationId,
      },
    })
    idMap.set('programme-service-role-assignments', record.id, created.id)
  }
}

export async function importEventPartAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ assignmentId: number; roleId: number; asKind: string }>(
    zip,
    'programme-part-assignment-allowed-roles',
  )
  const data: { eventPartId: number; roleId: number; asKind: string; congregationId: number }[] = []

  for (const record of records) {
    const eventPartId = idMap.getOptional('programme-part-assignments', record.assignmentId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!eventPartId || !roleId) continue
    data.push({ eventPartId, roleId, asKind: record.asKind, congregationId })
  }

  if (data.length > 0) {
    await db.eventPartAllowedRole.createMany({ data, skipDuplicates: true })
  }
}

export async function importEventServicePartAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ assignmentId: number; roleId: number }>(
    zip,
    'programme-service-role-assignment-allowed-roles',
  )
  const data: { eventServicePartId: number; roleId: number; congregationId: number }[] = []

  for (const record of records) {
    const eventServicePartId = idMap.getOptional('programme-service-role-assignments', record.assignmentId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!eventServicePartId || !roleId) continue
    data.push({ eventServicePartId, roleId, congregationId })
  }

  if (data.length > 0) {
    await db.eventServicePartAllowedRole.createMany({ data, skipDuplicates: true })
  }
}
