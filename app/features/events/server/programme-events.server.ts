import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function createFreeformEvent(
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
  const event = await db.event.create({ data })

  audit({
    action: AuditAction.EventCreated,
    congregationId: data.congregationId,
    actorId: data.createdById,
    entityType: 'Event',
    entityId: event.id,
    metadata: { name: data.name },
  })

  return event
}

export async function bulkDeleteEvents(db: TransactionClient, ids: number[], congregationId: number, actorId: number) {
  const result = await db.event.deleteMany({
    where: { id: { in: ids }, congregationId },
  })

  audit({
    action: AuditAction.EventsBulkDeleted,
    congregationId,
    actorId,
    metadata: { count: ids.length },
  })

  return result
}

export async function deleteEvent(db: TransactionClient, id: number, congregationId: number, actorId: number) {
  const event = await db.event.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
  })

  audit({
    action: AuditAction.EventDeleted,
    congregationId,
    actorId,
    entityType: 'Event',
    entityId: id,
  })

  return event
}

export async function updateEvent(
  db: TransactionClient,
  id: number,
  congregationId: number,
  data: Record<string, unknown>,
  actorId: number,
) {
  const event = await db.event.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
    data,
  })

  audit({
    action: AuditAction.EventUpdated,
    congregationId,
    actorId,
    entityType: 'Event',
    entityId: id,
  })

  return event
}

export function addPartAssignment(
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
    congregationId: number
  },
) {
  return db.programmePartAssignment.create({ data })
}

export function deletePartAssignment(db: TransactionClient, id: number, congregationId: number) {
  return db.programmePartAssignment.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
  })
}

export function addServiceRoleAssignment(
  db: TransactionClient,
  data: {
    eventId: number
    name: string
    congregationId: number
  },
) {
  return db.programmeServiceRoleAssignment.create({ data })
}

export function deleteServiceRoleAssignment(db: TransactionClient, id: number, congregationId: number) {
  return db.programmeServiceRoleAssignment.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
  })
}

export function updateServiceRoleAssignment(
  db: TransactionClient,
  id: number,
  data: { name: string },
  congregationId: number,
) {
  return db.programmeServiceRoleAssignment.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
    data,
  })
}

export function updatePartAssignment(
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
  },
  congregationId: number,
) {
  return db.programmePartAssignment.update({
    where: { id },
    data: { ...data, congregationId },
  })
}

export async function reorderPartAssignments(
  db: TransactionClient,
  congregationId: number,
  orderedIds: number[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.programmePartAssignment.update({
      where: { id: orderedIds[i] },
      data: { order: i * 5 },
    })
  }
}

export async function applyTemplateToEvent(
  db: TransactionClient,
  eventId: number,
  templateId: number,
  congregationId: number,
  _actorId: number,
) {
  const template = await db.programmeTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: { parts: true, serviceRoles: true },
  })

  if (!template) return null

  await db.event.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id: eventId, congregationId },
    },
    data: { templateId },
  })

  for (const part of template.parts) {
    await db.programmePartAssignment.create({
      data: {
        eventId,
        partId: part.id,
        name: part.name,
        section: part.section,
        track: part.track,
        order: part.order,
        durationMin: part.durationMin,
        congregationId,
      },
    })
  }

  for (const role of template.serviceRoles) {
    await db.programmeServiceRoleAssignment.create({
      data: { eventId, serviceRoleId: role.id, name: role.name, congregationId },
    })
  }

  return template
}
