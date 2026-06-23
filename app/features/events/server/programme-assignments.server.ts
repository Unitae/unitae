import { EventKind } from '~/features/events/model/event-kind.type'
import {
  getPartAssignmentAllowedRoleIds,
  getServiceRoleAssignmentAllowedRoleIds,
  resolveEligibleUserIds,
} from '~/features/events/server/allowed-roles.server'
import { areParticipantsDistinct } from '~/features/events/server/programme-assignment.policy'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

export function getEventProgramme(db: TransactionClient, eventId: number, congregationId: number) {
  return db.event.findFirst({
    where: { id: eventId, congregationId },
    include: {
      template: true,
      kind: true,
      partAssignments: {
        include: {
          assignee: true,
          assistant: true,
          externalSpeaker: true,
        },
        orderBy: [{ order: 'asc' }, { trackOrder: { sort: 'asc', nulls: 'last' } }],
      },
      serviceRoleAssignments: {
        include: {
          assignee: true,
        },
        orderBy: { name: 'asc' },
      },
    },
  })
}

export async function assignPart(
  db: TransactionClient,
  assignmentId: number,
  assigneeId: number | null,
  assistantId: number | null,
  externalSpeakerId: number | null,
  topic: string,
  congregationId: number,
) {
  const existing = await db.programmePartAssignment.findFirst({
    where: { id: assignmentId, congregationId },
    include: { event: true },
  })
  if (!existing) return { error: "L'attribution n'existe pas." }

  const cleanTopic = sanitizeText(topic)

  if (externalSpeakerId != null) {
    const speaker = await db.externalSpeaker.findFirst({
      where: { id: externalSpeakerId, congregationId, archivedAt: null },
    })
    if (!speaker) return { error: "Cet orateur externe n'existe pas ou a été archivé." }

    const assignment = await db.programmePartAssignment.update({
      where: {
        id_congregationId: { id: assignmentId, congregationId },
      },
      data: { assigneeId: null, assistantId: null, externalSpeakerId, topic: cleanTopic, hasConflict: false },
    })
    return { assignment }
  }

  if (!areParticipantsDistinct(assigneeId, assistantId)) {
    return { error: "L'orateur et le lecteur ne peuvent pas être la même personne." }
  }

  if (assigneeId != null) {
    const allowed = await getPartAssignmentAllowedRoleIds(db, assignmentId, 'speaker', congregationId)
    const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
    if (!eligible.includes(assigneeId)) {
      return { error: "L'orateur sélectionné ne fait pas partie des rôles autorisés pour cette partie." }
    }
    const conflict = await checkDayOffConflict(
      db,
      assigneeId,
      existing.event.startDate,
      existing.event.endDate,
      congregationId,
    )
    if (conflict) return { error: 'Ce proclamateur a une absence durant cette date.' }
  }

  if (assistantId != null) {
    const allowed = await getPartAssignmentAllowedRoleIds(db, assignmentId, 'reader', congregationId)
    const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
    if (!eligible.includes(assistantId)) {
      return { error: 'Le deuxième orateur sélectionné ne fait pas partie des rôles autorisés pour cette partie.' }
    }
    const conflict = await checkDayOffConflict(
      db,
      assistantId,
      existing.event.startDate,
      existing.event.endDate,
      congregationId,
    )
    if (conflict) return { error: 'Le deuxième orateur a une absence durant cette date.' }
  }

  const assignment = await db.programmePartAssignment.update({
    where: {
      id_congregationId: { id: assignmentId, congregationId },
    },
    data: { assigneeId, assistantId, externalSpeakerId: null, topic: cleanTopic, hasConflict: false },
  })

  return { assignment }
}

export async function assignServiceRole(
  db: TransactionClient,
  assignmentId: number,
  assigneeId: number | null,
  congregationId: number,
) {
  const existing = await db.programmeServiceRoleAssignment.findFirst({
    where: { id: assignmentId, congregationId },
    include: { event: true },
  })
  if (!existing) return { error: "L'attribution n'existe pas." }

  if (assigneeId != null) {
    const allowed = await getServiceRoleAssignmentAllowedRoleIds(db, assignmentId, congregationId)
    const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
    if (!eligible.includes(assigneeId)) {
      return { error: 'Le proclamateur sélectionné ne fait pas partie des rôles autorisés pour ce service.' }
    }
    const conflict = await checkDayOffConflict(
      db,
      assigneeId,
      existing.event.startDate,
      existing.event.endDate,
      congregationId,
    )
    if (conflict) return { error: 'Ce proclamateur a une absence durant cette date.' }
  }

  const assignment = await db.programmeServiceRoleAssignment.update({
    where: {
      id_congregationId: { id: assignmentId, congregationId },
    },
    data: { assigneeId, hasConflict: false },
  })

  return { assignment }
}

export function unassignPart(db: TransactionClient, assignmentId: number, congregationId: number) {
  return db.programmePartAssignment.update({
    where: {
      id_congregationId: { id: assignmentId, congregationId },
    },
    data: { assigneeId: null, assistantId: null, externalSpeakerId: null, hasConflict: false },
  })
}

export function unassignServiceRole(db: TransactionClient, assignmentId: number, congregationId: number) {
  return db.programmeServiceRoleAssignment.update({
    where: {
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
