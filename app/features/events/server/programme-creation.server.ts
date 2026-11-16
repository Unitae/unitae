import { SYSTEM_TEMPLATE_KEYS } from '~/features/events/model/event-template.type'
import { daysOnWeekday, programmeKey } from '~/features/events/model/programme-dates'
import {
  giveProgramme,
  TEMPLATE_INCLUDE,
  type TemplateWithRelations,
} from '~/features/events/server/give-programme.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { dayOf, endOfDay, startOfDay } from '~/shared/utils/calendar-day'
import { combineLocalDateTime } from '~/shared/utils/event-time'

/** Who creates, for which congregation, and the zone its days are counted in. */
export interface CreationContext {
  congregationId: number
  timezone: string
  actorId: number
}

export interface CreatedProgramme {
  id: number
  templateId: number
  day: string
}

export interface SeriesResult {
  created: CreatedProgramme[]
  /** Days of the period that already had the template's programme: left as they are. */
  existing: number
  /** Days the person chose to pass, such as a circuit assembly week. */
  skipped: number
}

/** The template already has a programme that day; `eventId` is that programme. */
export class ProgrammeExistsError extends ConflictError {
  constructor(readonly eventId: number) {
    super('programme_exists')
  }
}

// Absences and freeform events have templates of their own, which no programme may be created from: an « Absence »
// created here would read as its author being away that day.
const NOT_A_SYSTEM_TEMPLATE = { notIn: [...SYSTEM_TEMPLATE_KEYS] }

/**
 * Creates the programmes of regular meetings over a period: each template on its weekday, every week from `from` to
 * `to` (calendar days in the congregation's zone, both included). A day that already has the template's programme is
 * left alone, and so is a day listed in `skip` (keys from `programmeKey`). Refuses, creating nothing, when one of the
 * templates is not a regular meeting of the congregation.
 */
export async function createProgrammeSeries(
  db: TransactionClient,
  input: { templateIds: number[]; from: string; to: string; skip?: string[] },
  ctx: CreationContext,
): Promise<SeriesResult> {
  const ids = [...new Set(input.templateIds)]
  const templates: TemplateWithRelations[] = await db.eventTemplate.findMany({
    where: { id: { in: ids }, congregationId: ctx.congregationId, key: NOT_A_SYSTEM_TEMPLATE },
    include: TEMPLATE_INCLUDE,
  })
  const recurring = templates.filter(template => template.weekDay != null)
  if (recurring.length !== ids.length) throw new NotFoundError('EventTemplate')

  await lockTemplates(db, ids, ctx.congregationId)
  const taken = await existingProgrammes(db, ids, input.from, input.to, ctx)
  const skip = new Set(input.skip ?? [])
  const planned = recurring
    .flatMap(template => daysOnWeekday(template.weekDay ?? 0, input.from, input.to).map(day => ({ template, day })))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))

  const result: SeriesResult = { created: [], existing: 0, skipped: 0 }
  for (const { template, day } of planned) {
    const key = programmeKey(template.id, day)
    const event = taken.get(key)
    if (skip.has(key) && (event == null || event.bare)) {
      // A day passed on purpose has no meeting: an empty one created ahead goes too.
      if (event) await removeEmptyMeeting(db, event.id, ctx)
      result.skipped++
    } else if (event?.bare && hasProgramme(template)) {
      result.created.push(await reuseMeeting(db, template, event.id, day, ctx))
    } else if (event) result.existing++
    else result.created.push(await createProgramme(db, template, day, ctx))
  }
  for (const template of recurring) await raiseMark(db, template, input.to, ctx.congregationId)
  return result
}

/**
 * Locks the templates' rows for the rest of the transaction, so a series and the recurring-events job cannot both
 * create the same day: there is no unique key on (template, day).
 */
async function lockTemplates(db: TransactionClient, templateIds: number[], congregationId: number) {
  // In id order, like the recurring-events job, so the two never wait on each other in a cycle.
  await db.$queryRaw`SELECT "id" FROM "EventTemplate" WHERE "id" = ANY(${templateIds}) AND "congregationId" = ${congregationId} ORDER BY "id" FOR UPDATE`
}

/**
 * Moves a recurring template's high-water mark up to `day` when it lies beyond it, never back: a day passed in a series
 * that runs past the recurring horizon must never be filled later by the recurring-events job.
 */
async function raiseMark(db: TransactionClient, template: TemplateWithRelations, day: string, congregationId: number) {
  if (template.weekDay == null || (template.generatedUntil != null && template.generatedUntil >= day)) return
  // GREATEST, not the value read before the lock: the job may have raised the mark meanwhile.
  await db.$executeRaw`UPDATE "EventTemplate" SET "generatedUntil" = GREATEST(COALESCE("generatedUntil", ${day}), ${day}) WHERE "id" = ${template.id} AND "congregationId" = ${congregationId}`
}

/** The template gives an event something: parts or services. One with neither cannot fill a meeting. */
function hasProgramme(template: TemplateWithRelations): boolean {
  return template.parts.length > 0 || template.serviceParts.length > 0
}

/** Deletes an empty meeting created ahead on a day the series passes on purpose. */
async function removeEmptyMeeting(db: TransactionClient, eventId: number, ctx: CreationContext) {
  await db.event.deleteMany({ where: { id: eventId, congregationId: ctx.congregationId } })
  await auditInTransaction(db, {
    action: AuditAction.EventDeleted,
    congregationId: ctx.congregationId,
    actorId: ctx.actorId,
    entityType: 'Event',
    entityId: eventId,
  })
}

/**
 * Gives an empty meeting created ahead its template's programme. Its hours and name are set again from the template
 * and the congregation's zone first: they may have changed since the meeting was created.
 */
async function reuseMeeting(
  db: TransactionClient,
  template: TemplateWithRelations,
  eventId: number,
  day: string,
  ctx: CreationContext,
): Promise<CreatedProgramme> {
  await db.event.update({
    where: { id_congregationId: { id: eventId, congregationId: ctx.congregationId } },
    data: {
      name: template.name,
      startDate: combineLocalDateTime(day, template.startTime, ctx.timezone),
      endDate: combineLocalDateTime(day, template.endTime, ctx.timezone),
    },
  })
  return giveProgramme(db, template, eventId, day, ctx, { reused: true })
}

/**
 * Creates one programme from any template the congregation plans programmes with, on that day: the Memorial, or a
 * regular meeting moved to another day for a week. Refuses a day the template already has a programme on.
 */
export async function createProgrammeOnDay(
  db: TransactionClient,
  input: { templateId: number; day: string },
  ctx: CreationContext,
): Promise<CreatedProgramme> {
  const template: TemplateWithRelations | null = await db.eventTemplate.findFirst({
    where: { id: input.templateId, congregationId: ctx.congregationId, key: NOT_A_SYSTEM_TEMPLATE },
    include: TEMPLATE_INCLUDE,
  })
  if (!template) throw new NotFoundError('EventTemplate', input.templateId)

  await lockTemplates(db, [template.id], ctx.congregationId)
  const sameDay = await db.event.findMany({
    where: {
      congregationId: ctx.congregationId,
      templateId: template.id,
      startDate: { gte: startOfDay(input.day, ctx.timezone), lte: endOfDay(input.day, ctx.timezone) },
    },
    select: EVENT_STATE,
    orderBy: { id: 'asc' },
  })
  // Any event of the template that day that is not an empty meeting is a programme already; so is an empty meeting
  // the template has nothing to give.
  const prepared = sameDay.find(event => !isBare(event)) ?? (hasProgramme(template) ? undefined : sameDay[0])
  if (prepared) throw new ProgrammeExistsError(prepared.id)

  const empty = sameDay[0]
  const created = empty
    ? await reuseMeeting(db, template, empty.id, input.day, ctx)
    : await createProgramme(db, template, input.day, ctx)
  await raiseMark(db, template, input.day, ctx.congregationId)
  return created
}

const EVENT_STATE = {
  id: true,
  createdById: true,
  attendance: { select: { id: true } },
  _count: { select: { eventParts: true, eventServiceParts: true } },
} as const

interface EventState {
  createdById?: number | null
  attendance?: { id: number } | null
  _count?: { eventParts: number; eventServiceParts: number }
}

/**
 * An empty meeting the recurring-events job created ahead: no author, no part, no service, no attendance. Only those are
 * filled by a series — an event someone emptied on purpose, or one with counts, is left as it is.
 */
function isBare(event: EventState): boolean {
  return (
    event.createdById === null &&
    event.attendance == null &&
    event._count != null &&
    event._count.eventParts === 0 &&
    event._count.eventServiceParts === 0
  )
}

/** The events the templates already have between two days, by `programmeKey`, and whether each is still bare. */
async function existingProgrammes(
  db: TransactionClient,
  templateIds: number[],
  from: string,
  to: string,
  ctx: CreationContext,
): Promise<Map<string, { id: number; bare: boolean }>> {
  const events = await db.event.findMany({
    where: {
      congregationId: ctx.congregationId,
      templateId: { in: templateIds },
      startDate: { gte: startOfDay(from, ctx.timezone), lte: endOfDay(to, ctx.timezone) },
    },
    select: { ...EVENT_STATE, templateId: true, startDate: true },
    orderBy: { id: 'asc' },
  })
  const byDay = new Map<string, { id: number; bare: boolean }>()
  for (const event of events) {
    if (event.templateId == null) continue
    const key = programmeKey(event.templateId, dayOf(event.startDate, ctx.timezone))
    // Two events of the template on a day: the prepared one decides, never the empty one.
    if (byDay.get(key)?.bare === false) continue
    byDay.set(key, { id: event.id, bare: isBare(event) })
  }
  return byDay
}

/** One programme from its template: the event at the template's hours that day, with its parts and services. */
async function createProgramme(
  db: TransactionClient,
  template: TemplateWithRelations,
  day: string,
  ctx: CreationContext,
): Promise<CreatedProgramme> {
  const event = await db.event.create({
    data: {
      name: template.name,
      startDate: combineLocalDateTime(day, template.startTime, ctx.timezone),
      endDate: combineLocalDateTime(day, template.endTime, ctx.timezone),
      templateId: template.id,
      createdById: ctx.actorId,
      congregationId: ctx.congregationId,
    },
  })
  return giveProgramme(db, template, event.id, day, ctx)
}
