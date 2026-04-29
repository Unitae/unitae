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
  },
) {
  return db.event.create({ data })
}

export function deleteEvent(db: TransactionClient, id: number, congregationId: number) {
  return db.event.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
  })
}

export function updateEvent(db: TransactionClient, id: number, congregationId: number, data: Record<string, unknown>) {
  return db.event.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
    data,
  })
}

export function addPartAssignment(
  db: TransactionClient,
  data: {
    eventId: number
    name: string
    section: string
    track: string
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

export function updatePartAssignment(
  db: TransactionClient,
  id: number,
  data: { name: string; section: string; track: string; order: number; durationMin: number | null; allowExternalSpeaker: boolean },
  congregationId: number,
) {
  return db.programmePartAssignment.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
    data,
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

export function deleteServiceRoleAssignment(db: TransactionClient, id: number, congregationId: number) {
  return db.programmeServiceRoleAssignment.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
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
        // biome-ignore lint/style/useNamingConvention: prisma compound key
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
    include: { parts: { orderBy: { order: 'asc' } }, serviceRoles: true },
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
        allowExternalSpeaker: part.allowExternalSpeaker,
        congregationId,
      },
    })
  }

  for (const role of template.serviceRoles) {
    await db.programmeServiceRoleAssignment.create({
      data: { eventId, serviceRoleId: role.id, name: role.name, congregationId },
    })
  }

  logger.info(`Applied template ${templateId} to event ${eventId}. User ID: ${userId}.`)
  return template
}
