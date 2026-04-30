import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType } from '~/shared/types/publisher-type'

export interface CreatePublisherActivityParams {
  publisherId: number
  month: number
  year: number
  type: PublisherType
  isPublisher: boolean
  hours: number
  studies: number
  notes: string
  congregationId: number
  actorId: number
}

export async function createPublisherActivity(db: TransactionClient, params: CreatePublisherActivityParams) {
  const activity = await db.publisherActivity.create({
    data: {
      publisherId: params.publisherId,
      month: params.month,
      year: params.year,
      type: params.type,
      isPublisher: params.isPublisher,
      hours: params.hours,
      studies: params.studies,
      notes: params.notes,
      congregationId: params.congregationId,
    },
  })

  audit({
    action: AuditAction.PublisherActivityCreated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'PublisherActivity',
    entityId: activity.id,
    metadata: { publisherId: params.publisherId, month: params.month, year: params.year },
  })

  return activity
}

export interface UpdatePublisherActivityParams {
  type: PublisherType
  isPublisher: boolean
  hours: number
  studies: number
  notes: string
}

export async function updatePublisherActivity(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdatePublisherActivityParams,
) {
  const activity = await db.publisherActivity.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
      id_congregationId: { id, congregationId },
    },
    data: {
      type: params.type,
      isPublisher: params.isPublisher,
      hours: params.hours,
      studies: params.studies,
      notes: params.notes,
    },
  })

  audit({
    action: AuditAction.PublisherActivityUpdated,
    congregationId,
    actorId,
    entityType: 'PublisherActivity',
    entityId: id,
  })

  return activity
}

export async function deletePublisherActivity(db: TransactionClient, id: number, congregationId: number, actorId: number) {
  const activity = await db.publisherActivity.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
      id_congregationId: { id, congregationId },
    },
    include: { publisher: true },
  })

  audit({
    action: AuditAction.PublisherActivityDeleted,
    congregationId,
    actorId,
    entityType: 'PublisherActivity',
    entityId: id,
  })

  return activity
}
