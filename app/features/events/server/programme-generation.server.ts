import { computeDatesForWeekdayCount } from '~/features/events/model/compute-dates'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

interface TemplateWithRelations {
  id: number
  name: string
  kindId: number | null
  parts: {
    id: number
    name: string
    section: string
    track: string
    trackOrder: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
  }[]
  serviceRoles: { id: number; name: string }[]
}

function loadTemplate(db: TransactionClient, templateId: number, congregationId: number) {
  return db.programmeTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: { orderBy: { order: 'asc' } },
      serviceRoles: true,
      kind: true,
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
      ...(meetingKindId != null ? { kindId: meetingKindId } : {}),
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
        trackOrder: part.trackOrder,
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
  occurrences: number,
  createdById: number,
  congregationId: number,
  startFrom?: Date,
) {
  const template = await loadTemplate(db, templateId, congregationId)
  if (!template || template.weekDay == null) return []

  const dates = computeDatesForWeekdayCount(template.weekDay, occurrences, startFrom)

  const existingEvents = await db.event.findMany({
    where: { templateId, congregationId, startDate: { gte: dates[0] ?? new Date() } },
    select: { startDate: true },
  })
  const existingDateStrings = new Set(existingEvents.map(e => toDateString(e.startDate)))

  const createdEvents = []
  for (const date of dates) {
    if (existingDateStrings.has(toDateString(date))) continue
    const event = await createEventWithAssignments(db, template, date, createdById, congregationId, template.kindId)
    createdEvents.push(event)
  }

  if (createdEvents.length > 0) {
    audit({
      action: AuditAction.ProgrammeGenerated,
      congregationId,
      actorId: createdById,
      entityType: 'ProgrammeTemplate',
      entityId: templateId,
      metadata: { templateId, count: createdEvents.length },
    })
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

  const event = await createEventWithAssignments(db, template, date, createdById, congregationId, template.kindId)

  if (event) {
    audit({
      action: AuditAction.ProgrammeGenerated,
      congregationId,
      actorId: createdById,
      entityType: 'Event',
      entityId: event.id,
      metadata: { templateId, date: date.toISOString() },
    })
  }

  return event
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
