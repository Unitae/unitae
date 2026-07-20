import { computeDatesForWeekdayCount } from '~/features/events/model/compute-dates'
import type { TransactionClient } from '~/shared/infra/db.server'
import { parseTimeString, setHoursInTimezone } from '~/shared/utils/event-time'

interface AllowedRoleRow {
  roleId: number
}

interface PartAllowedRoleRow extends AllowedRoleRow {
  asKind: string
}

interface TemplateWithRelations {
  id: number
  name: string
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
    allowedRoles: PartAllowedRoleRow[]
  }[]
  serviceRoles: { id: number; name: string; allowedRoles: AllowedRoleRow[] }[]
}

function loadTemplate(db: TransactionClient, templateId: number, congregationId: number) {
  return db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: { allowedRoles: true },
      },
      serviceRoles: { include: { allowedRoles: true } },
    },
  })
}

async function createEventWithAssignments(
  db: TransactionClient,
  template: TemplateWithRelations,
  date: Date,
  createdById: number,
  congregationId: number,
  timezone: string,
) {
  const { hour: startHour, minute: startMinute } = parseTimeString(template.startTime)
  const { hour: endHour, minute: endMinute } = parseTimeString(template.endTime)
  const startDate = setHoursInTimezone(date, startHour, startMinute, timezone)
  const endDate = setHoursInTimezone(date, endHour, endMinute, timezone)

  const event = await db.event.create({
    data: {
      name: template.name,
      startDate,
      endDate,
      templateId: template.id,
      createdById,
      congregationId,
    },
  })

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
        congregationId,
      },
    })
    if (part.allowedRoles.length > 0) {
      await db.eventPartAllowedRole.createMany({
        data: part.allowedRoles.map(r => ({
          eventPartId: assignment.id,
          roleId: r.roleId,
          asKind: r.asKind,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  for (const role of template.serviceRoles) {
    const assignment = await db.eventServiceRole.create({
      data: {
        eventId: event.id,
        serviceRoleId: role.id,
        name: role.name,
        congregationId,
      },
    })
    if (role.allowedRoles.length > 0) {
      await db.eventServiceRoleAllowedRole.createMany({
        data: role.allowedRoles.map(r => ({
          eventServiceRoleId: assignment.id,
          roleId: r.roleId,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  return event
}

export async function generateEventsFromTemplate(
  db: TransactionClient,
  templateId: number,
  occurrences: number,
  createdById: number,
  congregationId: number,
  timezone: string,
  startFrom?: Date,
) {
  const template = await loadTemplate(db, templateId, congregationId)
  if (!template || template.weekDay == null) return []

  const dates = computeDatesForWeekdayCount(template.weekDay, occurrences, startFrom)

  const existingEvents = await db.event.findMany({
    where: { templateId, congregationId, startDate: { gte: dates[0] ?? new Date() } },
    select: { startDate: true },
  })
  const existingDateStrings = new Set(existingEvents.map(e => toDateString(e.startDate, timezone)))

  const createdEvents = []
  for (const date of dates) {
    if (existingDateStrings.has(toDateString(date, timezone))) continue
    const event = await createEventWithAssignments(db, template, date, createdById, congregationId, timezone)
    createdEvents.push(event)
  }

  return createdEvents
}

export async function createSingleEventFromTemplate(
  db: TransactionClient,
  templateId: number,
  date: Date,
  createdById: number,
  congregationId: number,
  timezone: string,
) {
  const template = await loadTemplate(db, templateId, congregationId)
  if (!template) return null

  // Check if an event already exists for this template on this date
  const existing = await db.event.findFirst({
    where: { templateId, congregationId, startDate: { gte: startOfDay(date), lte: endOfDay(date) } },
  })
  if (existing) return null

  return createEventWithAssignments(db, template, date, createdById, congregationId, timezone)
}

function toDateString(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find(p => p.type === 'year')?.value ?? '1970'
  const month = parts.find(p => p.type === 'month')?.value ?? '01'
  const day = parts.find(p => p.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}
