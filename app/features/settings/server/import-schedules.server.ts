import type JsZip from 'jszip'
import { isScheduleKind, ScheduleStatus, UNNAMED_SCHEDULE_KEY } from '~/features/events'
import { attachEventItems, syncTemplateScheduleTemplates } from '~/features/events/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-schedules')

// An archive carries its schedules from 2.21: schedule templates, which ones each template suggests, each event's
// schedules; the items name theirs. An older archive carries none, and a restore gives them by the add_schedules
// migration's rule (settleImportedSchedules).

interface ScheduleTemplateRecord {
  id: number
  name: string | null
  key: string | null
  kind: string
  responsibleRoleId: number | null
}

interface KindScheduleTemplateRecord {
  eventKindId: number
  scheduleTemplateId: number
  order: number
}

interface ScheduleRecord {
  id: number
  eventId: number
  scheduleTemplateId: number | null
  name: string | null
  key: string | null
  kind: string
  order: number
  status: string
}

/** Before the template items, which name them. A kind outside the catalogue is left out, with a log line. */
export async function importScheduleTemplates(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<ScheduleTemplateRecord>(zip, 'schedule-templates')
  for (const record of records) {
    if (!isScheduleKind(record.kind)) {
      logger.warn('Skipped a schedule template of an unknown kind', { kind: record.kind })
      continue
    }
    const created = await db.scheduleTemplate.create({
      data: {
        name: record.name,
        // Never neither (ScheduleTemplate_label_check): the catalogue's key when the archive has no name.
        key: record.key ?? (record.name == null ? UNNAMED_SCHEDULE_KEY[record.kind] : null),
        kind: record.kind,
        responsibleRoleId: idMap.getOptional('roles', record.responsibleRoleId),
        congregationId,
      },
    })
    idMap.set('schedule-templates', record.id, created.id)
  }
}

/** After the templates and the schedule templates: a link whose either end did not come is left out. */
export async function importKindScheduleTemplates(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<KindScheduleTemplateRecord>(zip, 'kind-schedule-templates')
  const data = records.flatMap(record => {
    const eventKindId = idMap.getOptional('programme-templates', record.eventKindId)
    const scheduleTemplateId = idMap.getOptional('schedule-templates', record.scheduleTemplateId)
    return eventKindId == null || scheduleTemplateId == null
      ? []
      : [{ eventKindId, scheduleTemplateId, order: record.order, congregationId }]
  })
  if (data.length > 0) await db.eventKindScheduleTemplate.createMany({ data, skipDuplicates: true })
}

/** After the events, before their items, which name them. One whose event did not come is left out. */
export async function importEventSchedules(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<ScheduleRecord>(zip, 'schedules')
  for (const record of records) {
    const eventId = idMap.getOptional('events', record.eventId)
    if (eventId == null) continue
    if (!isScheduleKind(record.kind)) {
      logger.warn('Skipped a schedule of an unknown kind', { kind: record.kind })
      continue
    }
    const created = await db.schedule.create({
      data: {
        eventId,
        scheduleTemplateId: idMap.getOptional('schedule-templates', record.scheduleTemplateId),
        name: record.name,
        key: record.key ?? (record.name == null ? UNNAMED_SCHEDULE_KEY[record.kind] : null),
        kind: record.kind,
        order: record.order,
        // An unknown status imports as a draft, as an event's does.
        status: record.status === ScheduleStatus.Published ? ScheduleStatus.Published : ScheduleStatus.Draft,
        congregationId,
      },
    })
    idMap.set('schedules', record.id, created.id)
  }
}

/**
 * After the templates, their responsibles, the events and their items. An archive that carries its schedules keeps
 * them as they are; only items that came without one (written by an older image before the export) are given theirs.
 * One that carries none (2.20 and older) gets the add_schedules migration's rule on everything restored, so restoring
 * it gives what migrating live data gives.
 */
export async function settleImportedSchedules(zip: JsZip, db: TransactionClient, congregationId: number) {
  const carriesSchedules = zip.file('data/schedules.ndjson') != null
  const withoutTemplate = carriesSchedules ? { scheduleTemplateId: null } : {}
  const templates = await db.eventTemplate.findMany({
    where: {
      congregationId,
      ...(carriesSchedules
        ? { OR: [{ parts: { some: withoutTemplate } }, { serviceParts: { some: withoutTemplate } }] }
        : {}),
    },
    select: { id: true },
  })
  for (const template of templates) await syncTemplateScheduleTemplates(db, template.id, congregationId)

  const withoutSchedule = carriesSchedules ? { scheduleId: null } : {}
  const events = await db.event.findMany({
    where: {
      congregationId,
      OR: [{ eventParts: { some: withoutSchedule } }, { eventServiceParts: { some: withoutSchedule } }],
    },
    select: { id: true },
  })
  await attachEventItems(
    db,
    events.map(event => event.id),
    congregationId,
  )
}
