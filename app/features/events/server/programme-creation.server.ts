import { EventOrigin } from '~/features/events/model/event-origin.type'
import { SYSTEM_TEMPLATE_KEYS } from '~/features/events/model/event-template.type'
import { daysOnWeekday, programmeKey } from '~/features/events/model/programme-dates'
import { EMPTY_MEETING } from '~/features/events/server/empty-meetings.queries'
import {
  giveProgramme,
  lockTemplates,
  TEMPLATE_INCLUDE,
  type TemplateWithRelations,
} from '~/features/events/server/give-programme.server'
import { createEmptyMeetings } from '~/features/events/server/recurring-events.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { addDays, dayOf, endOfDay, startOfDay } from '~/shared/utils/calendar-day'
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

// The freeform template has nothing for a programme to copy, and its events are made one at a time: no programme is
// created from a system template.
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
    if (skip.has(key) && (event == null || !event.programme)) {
      // A day passed on purpose has no meeting: an empty one created ahead goes too. One with counts stays.
      if (event?.empty) await removeEmptyMeeting(db, event.id, ctx)
      result.skipped++
    } else if (event && !event.programme && hasProgramme(template)) {
      result.created.push(await fillMeeting(db, template, event, day, ctx))
    } else if (event) result.existing++
    else result.created.push(await createProgramme(db, template, day, ctx))
  }
  for (const template of recurring) await coverUpTo(db, template, input, ctx)
  return result
}

/**
 * After a series, a recurring template's events exist up to its end: its high-water mark moves there, so a day passed in
 * it is never filled later by the recurring-events job. When the series starts beyond the mark, the weeks in between
 * get their empty meetings first — otherwise moving the mark would leave them never created.
 */
async function coverUpTo(
  db: TransactionClient,
  template: TemplateWithRelations,
  input: { from: string; to: string },
  ctx: CreationContext,
) {
  if (template.weekDay == null || (template.generatedUntil != null && template.generatedUntil >= input.to)) return
  const today = dayOf(new Date(), ctx.timezone)
  const afterMark = template.generatedUntil == null ? today : addDays(template.generatedUntil, 1)
  const gapFrom = afterMark > today ? afterMark : today
  const gapTo = addDays(input.from, -1)
  if (gapFrom <= gapTo) {
    const taken = await existingProgrammes(db, [template.id], gapFrom, gapTo, ctx)
    const days = daysOnWeekday(template.weekDay, gapFrom, gapTo).filter(
      day => !taken.has(programmeKey(template.id, day)),
    )
    await createEmptyMeetings(db, template, days, { congregationId: ctx.congregationId, timeZone: ctx.timezone })
  }
  await raiseMark(db, template, input.to, ctx.congregationId)
}

/**
 * Locks the templates' rows for the rest of the transaction, so a series and the recurring-events job cannot both
 * create the same day: there is no unique key on (template, day).
 */
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
  // Checked again in the query: only the job's empty meeting goes, whatever the caller read.
  await db.event.deleteMany({ where: { id: eventId, congregationId: ctx.congregationId, ...EMPTY_MEETING } })
  await auditInTransaction(db, {
    action: AuditAction.EventDeleted,
    congregationId: ctx.congregationId,
    actorId: ctx.actorId,
    entityType: 'Event',
    entityId: eventId,
  })
}

/**
 * Gives a meeting without a programme its template's programme. One the recurring-events job created ahead gets its
 * hours and name from the template and the congregation's zone first — they may have changed since — and the person as
 * its author. One made by hand, or prepared before and then emptied, keeps its name and hours, and its author unless
 * it has none.
 */
async function fillMeeting(
  db: TransactionClient,
  template: TemplateWithRelations,
  event: { id: number; createdById?: number | null; origin?: string },
  day: string,
  ctx: CreationContext,
): Promise<CreatedProgramme> {
  const eventId = event.id
  if (event.origin !== EventOrigin.Job) {
    // Not the job's (made by hand or restored): its name and hours stay. Whoever fills it prepares it when nobody is
    // named — its author's account may have gone — as « Créer le programme » does.
    if (event.createdById == null) {
      await db.event.update({
        where: { id_congregationId: { id: eventId, congregationId: ctx.congregationId } },
        data: { createdById: ctx.actorId },
      })
    }
    return giveProgramme(db, template, eventId, day, ctx, { reused: true })
  }
  await db.event.update({
    where: { id_congregationId: { id: eventId, congregationId: ctx.congregationId } },
    data: {
      name: template.name,
      startDate: combineLocalDateTime(day, template.startTime, ctx.timezone),
      endDate: combineLocalDateTime(day, template.endTime, ctx.timezone),
      // Whoever gives it its programme prepares it: the meeting is no longer the job’s.
      createdById: ctx.actorId,
      origin: EventOrigin.Manual,
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
  // Any event of the template that day with parts or services is a programme already; so is a meeting without one when
  // the template has nothing to give.
  const prepared = sameDay.find(hasParts) ?? (hasProgramme(template) ? undefined : sameDay[0])
  if (prepared) throw new ProgrammeExistsError(prepared.id)

  const unprepared = sameDay[0]
  // The mark stays: one day far ahead says nothing about the weeks before it.
  return unprepared
    ? await fillMeeting(db, template, unprepared, input.day, ctx)
    : await createProgramme(db, template, input.day, ctx)
}

const EVENT_STATE = {
  id: true,
  createdById: true,
  origin: true,
  attendance: { select: { id: true } },
  _count: { select: { eventParts: true, eventServiceParts: true } },
} as const

interface EventState {
  createdById?: number | null
  origin?: string
  attendance?: { id: number } | null
  _count?: { eventParts: number; eventServiceParts: number }
}

/** The event has a programme: parts or services. One without is filled when someone asks for its programme. */
function hasParts(event: EventState): boolean {
  return event._count == null || event._count.eventParts > 0 || event._count.eventServiceParts > 0
}

/**
 * An empty meeting the recurring-events job created ahead (EMPTY_MEETING): origin « job », no programme, no attendance. Only
 * those may be deleted when a series passes their day — one someone made or prepared, or one with counts, stays.
 */
function isEmptyMeeting(event: EventState): boolean {
  return event.origin === EventOrigin.Job && event.attendance == null && !hasParts(event)
}

/** The events the templates already have between two days, by `programmeKey`: whether each has a programme, and whether
 * it is an empty meeting created ahead. */
interface ExistingEvent {
  id: number
  createdById: number | null
  origin: string
  /** It has parts or services. */
  programme: boolean
  /** An empty meeting created ahead, which a passed day deletes. */
  empty: boolean
}

async function existingProgrammes(
  db: TransactionClient,
  templateIds: number[],
  from: string,
  to: string,
  ctx: CreationContext,
): Promise<Map<string, ExistingEvent>> {
  const events = await db.event.findMany({
    where: {
      congregationId: ctx.congregationId,
      templateId: { in: templateIds },
      startDate: { gte: startOfDay(from, ctx.timezone), lte: endOfDay(to, ctx.timezone) },
    },
    select: { ...EVENT_STATE, templateId: true, startDate: true },
    orderBy: { id: 'asc' },
  })
  const byDay = new Map<string, ExistingEvent>()
  for (const event of events) {
    if (event.templateId == null) continue
    const key = programmeKey(event.templateId, dayOf(event.startDate, ctx.timezone))
    // Two events of the template on a day: the one with a programme decides, never the one without.
    if (byDay.get(key)?.programme) continue
    byDay.set(key, {
      id: event.id,
      createdById: event.createdById,
      origin: event.origin,
      programme: hasParts(event),
      empty: isEmptyMeeting(event),
    })
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
