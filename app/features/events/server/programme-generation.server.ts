import { EventKind } from '~/features/events/model/event-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

interface TemplateWithRelations {
  id: number
  name: string
  parts: { id: number; name: string; section: string; track: string; order: number; durationMin: number | null; allowExternalSpeaker: boolean }[]
  serviceRoles: { id: number; name: string }[]
}

function loadTemplate(db: TransactionClient, templateId: number, congregationId: number) {
  return db.programmeTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: { orderBy: { order: 'asc' } },
      serviceRoles: true,
    },
  })
}

async function createEventWithAssignments(
  db: TransactionClient,
  template: TemplateWithRelations,
  date: Date,
  createdById: number,
  congregationId: number,
  meetingKindId: number | null,
) {
  const startDate = new Date(date)
  startDate.setHours(19, 0, 0, 0)
  const endDate = new Date(date)
  endDate.setHours(21, 0, 0, 0)

  const event = await db.event.create({
    data: {
      name: template.name,
      startDate,
      endDate,
      templateId: template.id,
      ...(meetingKindId ? { kindId: meetingKindId } : {}),
      createdById,
      congregationId,
    },
  })

  for (const part of template.parts) {
    await db.programmePartAssignment.create({
      data: {
        eventId: event.id,
        partId: part.id,
        name: part.name,
        section: part.section,
        track: part.track,
        order: part.order,
        durationMin: part.durationMin,
        allowExternalSpeaker: part.allowExternalSpeaker,
        congregationId,
      },
    })
  }

  for (const role of template.serviceRoles) {
    await db.programmeServiceRoleAssignment.create({
      data: {
        eventId: event.id,
        serviceRoleId: role.id,
        name: role.name,
        congregationId,
      },
    })
  }

  return event
}

export async function generateEventsFromTemplate(
  db: TransactionClient,
  templateId: number,
  monthsAhead: number,
  createdById: number,
  congregationId: number,
) {
  const template = await loadTemplate(db, templateId, congregationId)
  if (!template || template.weekDay == null) return []

  const dates = computeDatesForWeekday(template.weekDay, monthsAhead)

  const existingEvents = await db.event.findMany({
    where: { templateId, congregationId, startDate: { gte: dates[0] ?? new Date() } },
    select: { startDate: true },
  })
  const existingDateStrings = new Set(existingEvents.map(e => toDateString(e.startDate)))

  const meetingKind = await db.eventKind.findFirst({ where: { key: EventKind.Meeting, congregationId } })

  const createdEvents = []
  for (const date of dates) {
    if (existingDateStrings.has(toDateString(date))) continue
    const event = await createEventWithAssignments(
      db,
      template,
      date,
      createdById,
      congregationId,
      meetingKind?.id ?? null,
    )
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
) {
  const template = await loadTemplate(db, templateId, congregationId)
  if (!template) return null

  // Check if an event already exists for this template on this date
  const existing = await db.event.findFirst({
    where: { templateId, congregationId, startDate: { gte: startOfDay(date), lte: endOfDay(date) } },
  })
  if (existing) return null

  const meetingKind = await db.eventKind.findFirst({ where: { key: EventKind.Meeting, congregationId } })
  return createEventWithAssignments(db, template, date, createdById, congregationId, meetingKind?.id ?? null)
}

export function computeDatesForWeekday(weekDay: number, monthsAhead: number): Date[] {
  const dates: Date[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const endDate = new Date(today)
  endDate.setMonth(endDate.getMonth() + monthsAhead)

  const current = new Date(today)
  const daysUntilTarget = (weekDay - current.getDay() + 7) % 7
  current.setDate(current.getDate() + (daysUntilTarget === 0 ? 0 : daysUntilTarget))

  while (current <= endDate) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 7)
  }

  return dates
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
