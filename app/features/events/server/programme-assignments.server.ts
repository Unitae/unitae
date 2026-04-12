import { EventKind } from '~/features/events/model/event-kind.type'
import type { TransactionClient } from '~/shared/libs/db.server'

export function getEventProgramme(db: TransactionClient, eventId: number, congregationId: number) {
  return db.event.findFirst({
    where: { id: eventId, congregationId },
    include: {
      template: true,
      kind: true,
      partAssignments: {
        include: {
          part: true,
          assignee: true,
          assistant: true,
        },
        orderBy: { part: { order: 'asc' } },
      },
      serviceRoleAssignments: {
        include: {
          serviceRole: true,
          assignee: true,
        },
        orderBy: { serviceRole: { name: 'asc' } },
      },
    },
  })
}

export async function assignPart(
  db: TransactionClient,
  eventId: number,
  partId: number,
  assigneeId: number | null,
  assistantId: number | null,
  topic: string,
  congregationId: number,
) {
  // Check for day-off conflict before assigning
  if (assigneeId != null) {
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (event) {
      const conflict = await checkDayOffConflict(db, assigneeId, event.startDate, event.endDate, congregationId)
      if (conflict) {
        return { error: 'Ce proclamateur a une absence durant cette date.' }
      }
    }
  }

  if (assistantId != null) {
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (event) {
      const conflict = await checkDayOffConflict(db, assistantId, event.startDate, event.endDate, congregationId)
      if (conflict) {
        return { error: "L'assistant a une absence durant cette date." }
      }
    }
  }

  const assignment = await db.programmePartAssignment.upsert({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      eventId_partId_congregationId: { eventId, partId, congregationId },
    },
    update: {
      assigneeId,
      assistantId,
      topic,
      hasConflict: false,
    },
    create: {
      eventId,
      partId,
      assigneeId,
      assistantId,
      topic,
      congregationId,
    },
  })

  return { assignment }
}

export async function assignServiceRole(
  db: TransactionClient,
  eventId: number,
  serviceRoleId: number,
  assigneeId: number | null,
  congregationId: number,
) {
  if (assigneeId != null) {
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (event) {
      const conflict = await checkDayOffConflict(db, assigneeId, event.startDate, event.endDate, congregationId)
      if (conflict) {
        return { error: 'Ce proclamateur a une absence durant cette date.' }
      }
    }
  }

  const assignment = await db.programmeServiceRoleAssignment.upsert({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      eventId_serviceRoleId_congregationId: { eventId, serviceRoleId, congregationId },
    },
    update: {
      assigneeId,
      hasConflict: false,
    },
    create: {
      eventId,
      serviceRoleId,
      assigneeId,
      congregationId,
    },
  })

  return { assignment }
}

export function unassignPart(db: TransactionClient, assignmentId: number, congregationId: number) {
  return db.programmePartAssignment.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id: assignmentId, congregationId },
    },
    data: { assigneeId: null, assistantId: null, hasConflict: false },
  })
}

export function unassignServiceRole(db: TransactionClient, assignmentId: number, congregationId: number) {
  return db.programmeServiceRoleAssignment.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id: assignmentId, congregationId },
    },
    data: { assigneeId: null, hasConflict: false },
  })
}

export async function checkDayOffConflict(
  db: TransactionClient,
  userId: number,
  startDate: Date,
  endDate: Date,
  congregationId: number,
): Promise<boolean> {
  const conflictingDayOff = await db.event.findFirst({
    where: {
      congregationId,
      createdById: userId,
      kind: { key: EventKind.Off },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  })

  return conflictingDayOff != null
}

export async function refreshConflictFlags(
  db: TransactionClient,
  userId: number,
  startDate: Date,
  endDate: Date,
  congregationId: number,
) {
  // Find all programme events overlapping with the given date range
  const overlappingEvents = await db.event.findMany({
    where: {
      congregationId,
      templateId: { not: null },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true, startDate: true, endDate: true },
  })

  for (const event of overlappingEvents) {
    const hasConflict = await checkDayOffConflict(db, userId, event.startDate, event.endDate, congregationId)

    // Update part assignments where this user is assigned
    await db.programmePartAssignment.updateMany({
      where: {
        eventId: event.id,
        congregationId,
        // biome-ignore lint/style/useNamingConvention: prisma syntax
        OR: [{ assigneeId: userId }, { assistantId: userId }],
      },
      data: { hasConflict },
    })

    // Update service role assignments where this user is assigned
    await db.programmeServiceRoleAssignment.updateMany({
      where: {
        eventId: event.id,
        assigneeId: userId,
        congregationId,
      },
      data: { hasConflict },
    })
  }
}
