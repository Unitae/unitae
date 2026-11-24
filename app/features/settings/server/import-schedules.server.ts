import type JsZip from 'jszip'
import {
  isScheduleKind,
  ResponsibilityScope,
  ScheduleKind,
  ScheduleStatus,
  UNNAMED_SCHEDULE_KEY,
} from '~/features/events'
import { attachEventItems, syncTemplateScheduleTemplates } from '~/features/events/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-schedules')

// An archive carries its schedules from 2.21: schedule templates, which ones each template suggests, each event's
// schedules; the items name theirs. An older archive carries none, and a restore gives them by the add_schedules
// migration's rule (settleImportedSchedules). A row a real export could not have written (an unknown kind, a second
// programme for an event, an item naming another event's schedule) is left out rather than aborting the restore.

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

/** Where a schedule's event is kept in the id map, by kind: an item may only join a schedule of its event and kind. */
const SCHEDULE_EVENT = { programme: 'schedule-events-programme', duty: 'schedule-events-duty' } as const

/** A name or a key, never neither (ScheduleTemplate_label_check, Schedule_label_check): the catalogue's when no name. */
function keyOf(record: { name: string | null; key: string | null }, kind: keyof typeof UNNAMED_SCHEDULE_KEY) {
  return record.key ?? (record.name == null ? UNNAMED_SCHEDULE_KEY[kind] : null)
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
      logger.warn('Skipped a schedule template of an unknown kind', { kind: record.kind, congregationId })
      continue
    }
    const created = await db.scheduleTemplate.create({
      data: {
        name: record.name,
        key: keyOf(record, record.kind),
        kind: record.kind,
        responsibleRoleId: idMap.getOptional('roles', record.responsibleRoleId),
        congregationId,
      },
    })
    idMap.set('schedule-templates', record.id, created.id)
  }
}

/**
 * After the templates and the schedule templates; a link whose either end did not come is left out. A template the
 * restore matched to one the congregation has (by its key) may already have a schedule template of that kind: the
 * archive's merges into it rather than standing beside it, since a template has one of each kind until the readers move
 * over. Answers the templates merged into, which settleImportedSchedules brings up to date.
 */
export async function importKindScheduleTemplates(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<number[]> {
  const records = await readNdjsonFile<KindScheduleTemplateRecord>(zip, 'kind-schedule-templates')
  const resolved = records.flatMap(record => {
    const eventKindId = idMap.getOptional('programme-templates', record.eventKindId)
    const scheduleTemplateId = idMap.getOptional('schedule-templates', record.scheduleTemplateId)
    return eventKindId == null || scheduleTemplateId == null
      ? []
      : [{ ...record, eventKindId, scheduleTemplateId, archived: record.scheduleTemplateId }]
  })
  if (resolved.length === 0) return []

  // The links already there are the congregation's own: every schedule template this restore made is unlinked yet.
  const present = await db.eventKindScheduleTemplate.findMany({
    where: { congregationId, eventKindId: { in: [...new Set(resolved.map(link => link.eventKindId))] } },
    select: { eventKindId: true, scheduleTemplate: { select: { id: true, kind: true } } },
    orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
  })
  const kinds = new Map(
    (
      await db.scheduleTemplate.findMany({
        where: { congregationId, id: { in: resolved.map(link => link.scheduleTemplateId) } },
        select: { id: true, kind: true, name: true, responsibleRoleId: true },
      })
    ).map(row => [row.id, row]),
  )
  const merged = new Set<number>()
  const replaced = new Set<number>()
  const renamed = new Set<number>()
  const links: { eventKindId: number; scheduleTemplateId: number; order: number; congregationId: number }[] = []
  for (const link of resolved) {
    const archived = kinds.get(link.scheduleTemplateId)
    const own = present.find(
      row => row.eventKindId === link.eventKindId && row.scheduleTemplate.kind === archived?.kind,
    )
    if (own) {
      // Its name is Réglages' since 6a-1b, which the kind's derivation no longer writes: the archive's name wins. So does
      // its responsible, which a pre-upgrade archive's duties held without a services row: writeInheritedServiceResponsibles
      // reads it there (the congregation's own role says nothing about the archive).
      const carried = {
        ...(archived?.name != null && { name: archived.name }),
        ...(archived?.responsibleRoleId != null && { responsibleRoleId: archived.responsibleRoleId }),
      }
      if (Object.keys(carried).length > 0 && !renamed.has(own.scheduleTemplate.id)) {
        await db.scheduleTemplate.update({
          where: { id_congregationId: { id: own.scheduleTemplate.id, congregationId } },
          data: carried,
        })
        renamed.add(own.scheduleTemplate.id)
      }
      idMap.set('schedule-templates', link.archived, own.scheduleTemplate.id)
      replaced.add(link.scheduleTemplateId)
      merged.add(link.eventKindId)
    } else {
      links.push({
        eventKindId: link.eventKindId,
        scheduleTemplateId: link.scheduleTemplateId,
        order: link.order,
        congregationId,
      })
    }
  }
  if (links.length > 0) await db.eventKindScheduleTemplate.createMany({ data: links, skipDuplicates: true })
  // Made from the archive a moment ago, nothing points at them yet: the ones merged away go.
  if (replaced.size > 0) await db.scheduleTemplate.deleteMany({ where: { congregationId, id: { in: [...replaced] } } })
  return [...merged]
}

/**
 * After the events, before their items, which name them. One whose event did not come, of a kind outside the
 * catalogue, or a second programme for its event (D9), is left out; an unknown status comes back as a draft. Both are
 * logged, the way the events' importer logs its own.
 */
export async function importEventSchedules(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<ScheduleRecord>(zip, 'schedules')
  const withProgramme = new Set<number>()
  let skipped = 0
  let unknownStatus = 0
  for (const record of records) {
    const eventId = idMap.getOptional('events', record.eventId)
    if (eventId == null) continue
    if (!isScheduleKind(record.kind) || (record.kind === 'programme' && withProgramme.has(eventId))) {
      skipped++
      continue
    }
    const status = archivedStatus(record.status)
    if (status == null) unknownStatus++
    const created = await db.schedule.create({
      data: {
        eventId,
        scheduleTemplateId: idMap.getOptional('schedule-templates', record.scheduleTemplateId),
        name: record.name,
        key: keyOf(record, record.kind),
        kind: record.kind,
        order: record.order,
        status: status ?? ScheduleStatus.Draft,
        congregationId,
      },
    })
    if (record.kind === 'programme') withProgramme.add(eventId)
    idMap.set('schedules', record.id, created.id)
    idMap.set(SCHEDULE_EVENT[record.kind], created.id, eventId)
  }
  if (skipped > 0) {
    logger.warn(`Skipped ${skipped} schedule(s) of an unknown kind or a second programme`, { congregationId })
  }
  if (unknownStatus > 0) {
    logger.warn(`Imported ${unknownStatus} schedule(s) with an unknown status as drafts`, { congregationId })
  }
}

/** The archived status when this version knows it. */
function archivedStatus(status: string): ScheduleStatus | null {
  return status === ScheduleStatus.Published || status === ScheduleStatus.Draft ? status : null
}

/**
 * The restored schedule an item names, when it is one of the item's own event and of its kind; null otherwise (not in
 * the archive, or naming another event's), and settleImportedSchedules gives the item one.
 */
export function scheduleOfItem(
  idMap: EntityIdMap,
  archivedScheduleId: number | null | undefined,
  eventId: number,
  kind: keyof typeof SCHEDULE_EVENT,
): number | null {
  const scheduleId = idMap.getOptional('schedules', archivedScheduleId)
  return scheduleId != null && idMap.getOptional(SCHEDULE_EVENT[kind], scheduleId) === eventId ? scheduleId : null
}

/**
 * An archive from before the duties had their own responsible (2026-11-24) restores as the upgrade migrates live data
 * (20261128090000_duties_own_responsible): a kind naming a programme responsible and no services one, with services,
 * gets the role its duties inherited written once as its services responsible: its duties schedule template's role
 * (2.21 and later), or the programme's when it has none yet (2.20 and older). A duties schedule template without a
 * role is left alone: after the upgrade it is a choice, and no newer archive holds a role there without a services row.
 */
async function writeInheritedServiceResponsibles(db: TransactionClient, congregationId: number) {
  const kinds = await db.eventTemplate.findMany({
    where: {
      congregationId,
      serviceParts: { some: {} },
      responsibles: { some: { scope: ResponsibilityScope.Programme }, none: { scope: ResponsibilityScope.Service } },
    },
    select: {
      id: true,
      responsibles: { where: { scope: ResponsibilityScope.Programme }, select: { roleId: true } },
      scheduleTemplates: {
        where: { scheduleTemplate: { kind: ScheduleKind.Duty } },
        orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
        select: { scheduleTemplate: { select: { responsibleRoleId: true } } },
      },
    },
  })
  let written = 0
  for (const kind of kinds) {
    const duties = kind.scheduleTemplates[0]?.scheduleTemplate
    const roleId = duties == null ? kind.responsibles[0]?.roleId : duties.responsibleRoleId
    if (roleId == null) continue
    await db.templateResponsible.create({
      data: { templateId: kind.id, roleId, scope: ResponsibilityScope.Service, congregationId },
    })
    written++
  }
  if (written > 0) {
    logger.info(`Wrote the inherited services responsible of ${written} restored template(s)`, { congregationId })
  }
}

/**
 * Last: it finds the items that came without a schedule, so every item must be in. An archive that carries its
 * schedules keeps their names and statuses, but for a template it touches: a template merged into one the congregation
 * had (`mergedTemplateIds`), or holding an item that came without a schedule template, is brought up to date by the
 * add_schedules migration's rule (its schedule templates take its name and responsibles, its items join them). An item
 * that came without a schedule (a writer that skipped the dual write, a schedule this version could not restore) joins
 * its event's of its kind, made if missing; the other schedules keep their status. An archive that carries none (2.20
 * and older) gets that rule on every template and event it restored, statuses included, so restoring it gives what
 * migrating live data gives.
 */
export async function settleImportedSchedules(
  zip: JsZip,
  db: TransactionClient,
  congregationId: number,
  mergedTemplateIds: number[] = [],
) {
  const carriesSchedules = zip.file('data/schedules.ndjson') != null
  await writeInheritedServiceResponsibles(db, congregationId)
  const withoutTemplate = { scheduleTemplateId: null }
  const templates = await db.eventTemplate.findMany({
    where: {
      congregationId,
      ...(carriesSchedules
        ? {
            OR: [
              { id: { in: mergedTemplateIds } },
              { parts: { some: withoutTemplate } },
              { serviceParts: { some: withoutTemplate } },
            ],
          }
        : {}),
    },
    select: { id: true },
  })
  const repaired = templates.filter(template => !mergedTemplateIds.includes(template.id)).length
  if (carriesSchedules && repaired > 0) {
    logger.info(`Gave ${repaired} restored template(s) the schedule templates their items lacked`, { congregationId })
  }
  for (const template of templates) await syncTemplateScheduleTemplates(db, template.id, congregationId)

  const withoutSchedule = carriesSchedules ? { scheduleId: null } : {}
  const events = await db.event.findMany({
    where: {
      congregationId,
      OR: [{ eventParts: { some: withoutSchedule } }, { eventServiceParts: { some: withoutSchedule } }],
    },
    select: { id: true },
  })
  if (carriesSchedules && events.length > 0) {
    logger.info(`Gave the items of ${events.length} restored event(s) the schedules they lacked`, { congregationId })
  }
  await attachEventItems(
    db,
    events.map(event => event.id),
    congregationId,
    { keepStatuses: carriesSchedules },
  )
}
