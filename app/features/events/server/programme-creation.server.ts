import { SYSTEM_TEMPLATE_KEYS } from '~/features/events/model/event-template.type'
import { daysOnWeekday, programmeKey } from '~/features/events/model/programme-dates'
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

interface TemplateWithRelations {
  id: number
  name: string
  weekDay: number | null
  /** How far the template's events exist or were left out on purpose (see recurring-events). */
  generatedUntil?: string | null
  startTime: string
  endTime: string
  parts: {
    id: number
    name: string
    section: string
    track: string
    trackOrder: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
    speakerLabel: string | null
    readerLabel: string | null
    presetId: number | null
    allowedRoles: { roleId: number; asKind: string }[]
  }[]
  serviceParts: { id: number; name: string; allowedRoles: { roleId: number }[] }[]
}

const TEMPLATE_INCLUDE = {
  parts: { orderBy: { order: 'asc' }, include: { allowedRoles: true } },
  serviceParts: { include: { allowedRoles: true } },
} as const

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
    if (event?.bare) result.created.push(await giveProgramme(db, template, event.id, day, ctx))
    else if (event) result.existing++
    else if (skip.has(key)) result.skipped++
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
  await db.$queryRaw`SELECT "id" FROM "EventTemplate" WHERE "id" = ANY(${templateIds}) AND "congregationId" = ${congregationId} FOR UPDATE`
}

/**
 * Moves a recurring template's high-water mark up to `day` when it lies beyond it, never back: a day passed in a series
 * that runs past the recurring horizon must never be filled later by the recurring-events job.
 */
async function raiseMark(db: TransactionClient, template: TemplateWithRelations, day: string, congregationId: number) {
  if (template.weekDay == null || (template.generatedUntil != null && template.generatedUntil >= day)) return
  await db.eventTemplate.update({
    where: { id_congregationId: { id: template.id, congregationId } },
    data: { generatedUntil: day },
  })
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
  const existing = await db.event.findFirst({
    where: {
      congregationId: ctx.congregationId,
      templateId: template.id,
      startDate: { gte: startOfDay(input.day, ctx.timezone), lte: endOfDay(input.day, ctx.timezone) },
    },
    select: { id: true, _count: { select: { eventParts: true, eventServiceParts: true } } },
  })
  // A meeting created ahead with no programme yet takes this one; any other event that day is a programme already.
  if (existing && !isBare(existing)) throw new ProgrammeExistsError(existing.id)

  const created = existing
    ? await giveProgramme(db, template, existing.id, input.day, ctx)
    : await createProgramme(db, template, input.day, ctx)
  await raiseMark(db, template, input.day, ctx.congregationId)
  return created
}

/** An event with neither parts nor services: a meeting nobody has prepared yet. */
function isBare(event: { _count?: { eventParts: number; eventServiceParts: number } }): boolean {
  return event._count != null && event._count.eventParts === 0 && event._count.eventServiceParts === 0
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
    select: {
      id: true,
      templateId: true,
      startDate: true,
      _count: { select: { eventParts: true, eventServiceParts: true } },
    },
  })
  return new Map(
    events.flatMap(event =>
      event.templateId == null
        ? []
        : [
            [
              programmeKey(event.templateId, dayOf(event.startDate, ctx.timezone)),
              { id: event.id, bare: isBare(event) },
            ],
          ],
    ),
  )
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

/**
 * Gives an event its template's programme: its parts in order and its services, with who may take each. Used on a new
 * event, and on a meeting the recurring-events job created ahead with no programme yet, which is reused rather than
 * doubled.
 */
export async function giveProgramme(
  db: TransactionClient,
  template: TemplateWithRelations,
  eventId: number,
  day: string,
  ctx: CreationContext,
): Promise<CreatedProgramme> {
  const { congregationId } = ctx
  const event = { id: eventId }
  for (const part of template.parts) {
    const assignment = await db.eventPart.create({
      data: {
        eventId: event.id,
        partId: part.id,
        name: part.name,
        section: part.section,
        track: part.track,
        trackOrder: part.trackOrder,
        order: part.order,
        durationMin: part.durationMin,
        allowExternalSpeaker: part.allowExternalSpeaker,
        speakerLabel: part.speakerLabel,
        readerLabel: part.readerLabel,
        // Carried, not denormalized-and-frozen like the labels above: the preset row itself stays the source of
        // truth for the share message, so an improved wording reaches assignments that already exist.
        presetId: part.presetId,
        congregationId,
      },
    })
    if (part.allowedRoles.length > 0) {
      await db.eventPartAllowedRole.createMany({
        data: part.allowedRoles.map(role => ({
          eventPartId: assignment.id,
          roleId: role.roleId,
          asKind: role.asKind,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  for (const service of template.serviceParts) {
    const assignment = await db.eventServicePart.create({
      data: { eventId: event.id, servicePartId: service.id, name: service.name, congregationId },
    })
    if (service.allowedRoles.length > 0) {
      await db.eventServicePartAllowedRole.createMany({
        data: service.allowedRoles.map(role => ({
          eventServicePartId: assignment.id,
          roleId: role.roleId,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  // Awaited, in the same transaction: the record of who created it stands or falls with the programme.
  await auditInTransaction(db, {
    action: AuditAction.EventCreated,
    congregationId,
    actorId: ctx.actorId,
    entityType: 'Event',
    entityId: event.id,
    metadata: { templateId: template.id, day },
  })
  return { id: event.id, templateId: template.id, day }
}
