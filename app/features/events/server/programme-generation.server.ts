import { EventKind } from '~/features/events/model/event-kind.type'
import type { TransactionClient } from '~/shared/libs/db.server'

export async function generateEventsFromTemplate(
  db: TransactionClient,
  templateId: number,
  monthsAhead: number,
  createdById: number,
  congregationId: number,
) {
  const template = await db.programmeTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: { orderBy: { order: 'asc' } },
      serviceRoles: true,
    },
  })

  if (!template) return []

  if (template.weekDay == null) return []

  const dates = computeDatesForWeekday(template.weekDay, monthsAhead)

  // Find existing events for this template to avoid duplicates
  const existingEvents = await db.event.findMany({
    where: {
      templateId,
      congregationId,
      startDate: { gte: dates[0] ?? new Date() },
    },
    select: { startDate: true },
  })

  const existingDateStrings = new Set(existingEvents.map(e => toDateString(e.startDate)))

  // Find the meeting EventKind for linking
  const meetingKind = await db.eventKind.findFirst({
    where: { key: EventKind.Meeting, congregationId },
  })

  const createdEvents = []

  for (const date of dates) {
    if (existingDateStrings.has(toDateString(date))) continue

    const startDate = new Date(date)
    startDate.setHours(19, 0, 0, 0)
    const endDate = new Date(date)
    endDate.setHours(21, 0, 0, 0)

    const event = await db.event.create({
      data: {
        name: template.name,
        startDate,
        endDate,
        templateId,
        ...(meetingKind ? { kindId: meetingKind.id } : {}),
        createdById,
        congregationId,
      },
    })

    // Create empty part assignments
    for (const part of template.parts) {
      await db.programmePartAssignment.create({
        data: {
          eventId: event.id,
          partId: part.id,
          congregationId,
        },
      })
    }

    // Create empty service role assignments
    for (const role of template.serviceRoles) {
      await db.programmeServiceRoleAssignment.create({
        data: {
          eventId: event.id,
          serviceRoleId: role.id,
          congregationId,
        },
      })
    }

    createdEvents.push(event)
  }

  return createdEvents
}

export function computeDatesForWeekday(weekDay: number, monthsAhead: number): Date[] {
  const dates: Date[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const endDate = new Date(today)
  endDate.setMonth(endDate.getMonth() + monthsAhead)

  // Find the next occurrence of the target weekday
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
