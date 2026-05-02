import { audit, AuditAction } from '~/shared/domain/audit.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface ExternalSpeakerInput {
  name: string
  congregationName: string
  phone: string
  email: string
  notes: string
}

export interface ExternalSpeakerListItem {
  id: number
  name: string
  congregationName: string
  phone: string | null
  email: string | null
  notes: string | null
  archivedAt: Date | null
  lastVisitDate: Date | null
}

interface ListOptions {
  search?: string
  includeArchived?: boolean
}

export async function listExternalSpeakers(
  db: TransactionClient,
  congregationId: number,
  options: ListOptions = {},
): Promise<ExternalSpeakerListItem[]> {
  const { search, includeArchived = false } = options

  const speakers = await db.externalSpeaker.findMany({
    where: {
      congregationId,
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { congregationName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    include: {
      partAssignments: {
        where: { event: { startDate: { lt: new Date() } } },
        select: { event: { select: { startDate: true } } },
        orderBy: { event: { startDate: 'desc' } },
        take: 1,
      },
    },
    orderBy: [{ name: 'asc' }],
  })

  return speakers.map(speaker => ({
    id: speaker.id,
    name: speaker.name,
    congregationName: speaker.congregationName,
    phone: speaker.phone,
    email: speaker.email,
    notes: speaker.notes,
    archivedAt: speaker.archivedAt,
    lastVisitDate: speaker.partAssignments[0]?.event.startDate ?? null,
  }))
}

export async function getExternalSpeaker(db: TransactionClient, id: number, congregationId: number) {
  const speaker = await db.externalSpeaker.findFirst({
    where: { id, congregationId },
  })
  if (!speaker) return null

  const recentHistory = await db.programmePartAssignment.findMany({
    where: {
      congregationId,
      externalSpeakerId: id,
      event: { startDate: { lt: new Date() } },
    },
    select: {
      name: true,
      topic: true,
      event: { select: { startDate: true } },
    },
    orderBy: { event: { startDate: 'desc' } },
    take: 5,
  })

  return {
    ...speaker,
    recentHistory: recentHistory.map(h => ({
      date: h.event.startDate,
      partName: h.name,
      topic: h.topic,
    })),
  }
}

export async function createExternalSpeaker(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  params: ExternalSpeakerInput,
) {
  const duplicate = await db.externalSpeaker.findFirst({
    where: {
      congregationId,
      name: { equals: params.name, mode: 'insensitive' },
      congregationName: { equals: params.congregationName, mode: 'insensitive' },
    },
  })
  if (duplicate) {
    throw new ConflictError('External speaker already exists for this congregation')
  }

  const speaker = await db.externalSpeaker.create({
    data: {
      name: params.name,
      congregationName: params.congregationName,
      phone: params.phone || null,
      email: params.email || null,
      notes: params.notes || null,
      congregationId,
    },
  })

  audit({
    action: AuditAction.ExternalSpeakerCreated,
    congregationId,
    actorId,
    entityType: 'ExternalSpeaker',
    entityId: speaker.id,
    metadata: { name: speaker.name, congregationName: speaker.congregationName },
  })

  return speaker
}

export async function updateExternalSpeaker(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: ExternalSpeakerInput,
) {
  const existing = await db.externalSpeaker.findFirst({ where: { id, congregationId } })
  if (!existing) throw new NotFoundError('ExternalSpeaker', id)

  const duplicate = await db.externalSpeaker.findFirst({
    where: {
      congregationId,
      id: { not: id },
      name: { equals: params.name, mode: 'insensitive' },
      congregationName: { equals: params.congregationName, mode: 'insensitive' },
    },
  })
  if (duplicate) {
    throw new ConflictError('External speaker already exists for this congregation')
  }

  const speaker = await db.externalSpeaker.update({
    where: { id_congregationId: { id, congregationId } },
    data: {
      name: params.name,
      congregationName: params.congregationName,
      phone: params.phone || null,
      email: params.email || null,
      notes: params.notes || null,
    },
  })

  audit({
    action: AuditAction.ExternalSpeakerUpdated,
    congregationId,
    actorId,
    entityType: 'ExternalSpeaker',
    entityId: speaker.id,
    metadata: { name: speaker.name, congregationName: speaker.congregationName },
  })

  return speaker
}

export async function archiveExternalSpeaker(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
) {
  const existing = await db.externalSpeaker.findFirst({ where: { id, congregationId } })
  if (!existing) throw new NotFoundError('ExternalSpeaker', id)

  const speaker = await db.externalSpeaker.update({
    where: { id_congregationId: { id, congregationId } },
    data: { archivedAt: new Date() },
  })

  audit({
    action: AuditAction.ExternalSpeakerArchived,
    congregationId,
    actorId,
    entityType: 'ExternalSpeaker',
    entityId: speaker.id,
  })

  return speaker
}

export async function unarchiveExternalSpeaker(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
) {
  const existing = await db.externalSpeaker.findFirst({ where: { id, congregationId } })
  if (!existing) throw new NotFoundError('ExternalSpeaker', id)

  const speaker = await db.externalSpeaker.update({
    where: { id_congregationId: { id, congregationId } },
    data: { archivedAt: null },
  })

  audit({
    action: AuditAction.ExternalSpeakerUnarchived,
    congregationId,
    actorId,
    entityType: 'ExternalSpeaker',
    entityId: speaker.id,
  })

  return speaker
}
