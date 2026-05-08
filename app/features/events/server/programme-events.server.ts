import {
  setPartAssignmentAllowedRoles,
  setServiceRoleAssignmentAllowedRoles,
} from '~/features/events/server/allowed-roles.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

export function createFreeformEvent(
  db: TransactionClient,
  data: {
    name: string
    startDate: Date
    endDate: Date
    createdById: number
    congregationId: number
    kindId?: number
  },
) {
  return db.event.create({ data })
}

export function bulkDeleteEvents(db: TransactionClient, ids: number[], congregationId: number) {
  return db.event.deleteMany({
    where: { id: { in: ids }, congregationId },
  })
}

export function deleteEvent(db: TransactionClient, id: number, congregationId: number) {
  return db.event.delete({
    where: {
      id_congregationId: { id, congregationId },
    },
  })
}

export function updateEvent(db: TransactionClient, id: number, congregationId: number, data: Record<string, unknown>) {
  return db.event.update({
    where: {
      id_congregationId: { id, congregationId },
    },
    data,
  })
}

export async function addPartAssignment(
  db: TransactionClient,
  data: {
    eventId: number
    name: string
    section: string
    track: string
    trackOrder?: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
    allowedSpeakerRoleIds: number[]
    allowedReaderRoleIds: number[]
    congregationId: number
  },
  actorId: number,
) {
  const { allowedSpeakerRoleIds, allowedReaderRoleIds, ...createData } = data
  const assignment = await db.programmePartAssignment.create({ data: createData })

  const speakerDiff = await setPartAssignmentAllowedRoles(
    db,
    assignment.id,
    'speaker',
    allowedSpeakerRoleIds,
    data.congregationId,
  )
  const readerDiff = await setPartAssignmentAllowedRoles(
    db,
    assignment.id,
    'reader',
    allowedReaderRoleIds,
    data.congregationId,
  )

  if (
    speakerDiff.added.length > 0 ||
    speakerDiff.removed.length > 0 ||
    readerDiff.added.length > 0 ||
    readerDiff.removed.length > 0
  ) {
    audit({
      action: AuditAction.PartAllowedRolesChanged,
      congregationId: data.congregationId,
      actorId,
      entityType: 'ProgrammePartAssignment',
      entityId: assignment.id,
      metadata: { speaker: speakerDiff, reader: readerDiff },
    })
  }

  return assignment
}

export function deletePartAssignment(db: TransactionClient, id: number, congregationId: number) {
  return db.programmePartAssignment.delete({
    where: {
      id_congregationId: { id, congregationId },
    },
  })
}

export async function addServiceRoleAssignment(
  db: TransactionClient,
  data: {
    eventId: number
    name: string
    allowedRoleIds: number[]
    congregationId: number
  },
  actorId: number,
) {
  const { allowedRoleIds, ...createData } = data
  const assignment = await db.programmeServiceRoleAssignment.create({ data: createData })

  const diff = await setServiceRoleAssignmentAllowedRoles(db, assignment.id, allowedRoleIds, data.congregationId)
  if (diff.added.length > 0 || diff.removed.length > 0) {
    audit({
      action: AuditAction.ServiceRoleAllowedRolesChanged,
      congregationId: data.congregationId,
      actorId,
      entityType: 'ProgrammeServiceRoleAssignment',
      entityId: assignment.id,
      metadata: { added: diff.added, removed: diff.removed },
    })
  }

  return assignment
}

export async function updatePartAssignment(
  db: TransactionClient,
  id: number,
  data: {
    name: string
    section: string
    track: string
    trackOrder?: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
    allowedSpeakerRoleIds: number[]
    allowedReaderRoleIds: number[]
  },
  congregationId: number,
  actorId: number,
) {
  const { allowedSpeakerRoleIds, allowedReaderRoleIds, ...updateData } = data
  const assignment = await db.programmePartAssignment.update({
    where: { id_congregationId: { id, congregationId } },
    data: updateData,
  })

  const speakerDiff = await setPartAssignmentAllowedRoles(db, id, 'speaker', allowedSpeakerRoleIds, congregationId)
  const readerDiff = await setPartAssignmentAllowedRoles(db, id, 'reader', allowedReaderRoleIds, congregationId)

  if (
    speakerDiff.added.length > 0 ||
    speakerDiff.removed.length > 0 ||
    readerDiff.added.length > 0 ||
    readerDiff.removed.length > 0
  ) {
    audit({
      action: AuditAction.PartAllowedRolesChanged,
      congregationId,
      actorId,
      entityType: 'ProgrammePartAssignment',
      entityId: id,
      metadata: { speaker: speakerDiff, reader: readerDiff },
    })
  }

  return assignment
}

export async function updateServiceRoleAssignment(
  db: TransactionClient,
  id: number,
  data: { name: string; allowedRoleIds: number[] },
  congregationId: number,
  actorId: number,
) {
  const assignment = await db.programmeServiceRoleAssignment.update({
    where: { id_congregationId: { id, congregationId } },
    data: { name: data.name },
  })

  const diff = await setServiceRoleAssignmentAllowedRoles(db, id, data.allowedRoleIds, congregationId)
  if (diff.added.length > 0 || diff.removed.length > 0) {
    audit({
      action: AuditAction.ServiceRoleAllowedRolesChanged,
      congregationId,
      actorId,
      entityType: 'ProgrammeServiceRoleAssignment',
      entityId: id,
      metadata: { added: diff.added, removed: diff.removed },
    })
  }

  return assignment
}

export function deleteServiceRoleAssignment(db: TransactionClient, id: number, congregationId: number) {
  return db.programmeServiceRoleAssignment.delete({
    where: {
      id_congregationId: { id, congregationId },
    },
  })
}

export async function reorderPartAssignments(
  db: TransactionClient,
  congregationId: number,
  orderedIds: number[],
): Promise<void> {
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_003, congregationId)

  for (let i = 0; i < orderedIds.length; i++) {
    await db.programmePartAssignment.update({
      where: {
        id_congregationId: { id: orderedIds[i], congregationId },
      },
      data: { order: i * 5 },
    })
  }
}

export async function applyTemplateToEvent(
  db: TransactionClient,
  eventId: number,
  templateId: number,
  congregationId: number,
  userId: number,
) {
  const template = await db.programmeTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: { allowedRoles: true },
      },
      serviceRoles: { include: { allowedRoles: true } },
    },
  })
  if (!template) return null

  await db.event.update({
    where: {
      id_congregationId: { id: eventId, congregationId },
    },
    data: { templateId },
  })

  for (const part of template.parts) {
    const assignment = await db.programmePartAssignment.create({
      data: {
        eventId,
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
    if (part.allowedRoles.length > 0) {
      await db.programmePartAssignmentAllowedRole.createMany({
        data: part.allowedRoles.map(r => ({
          assignmentId: assignment.id,
          roleId: r.roleId,
          asKind: r.asKind,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  for (const role of template.serviceRoles) {
    const assignment = await db.programmeServiceRoleAssignment.create({
      data: { eventId, serviceRoleId: role.id, name: role.name, congregationId },
    })
    if (role.allowedRoles.length > 0) {
      await db.programmeServiceRoleAssignmentAllowedRole.createMany({
        data: role.allowedRoles.map(r => ({
          assignmentId: assignment.id,
          roleId: r.roleId,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  logger.info(`Applied template ${templateId} to event ${eventId}. User ID: ${userId}.`)
  return template
}
