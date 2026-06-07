import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { PublisherType } from '~/shared/types/publisher-type'
import { evaluateInactiveStatus } from './evaluate-inactive-status.server'

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

  await evaluateInactiveStatus(db, {
    publisherId: params.publisherId,
    congregationId: params.congregationId,
    actorId: params.actorId,
    trigger: 'activity-created',
    triggeringActivity: { isPublisher: activity.isPublisher, hours: activity.hours },
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

  await evaluateInactiveStatus(db, {
    publisherId: activity.publisherId,
    congregationId,
    actorId,
    trigger: 'activity-updated',
    triggeringActivity: { isPublisher: activity.isPublisher, hours: activity.hours },
  })

  return activity
}

export async function deletePublisherActivity(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
) {
  const activity = await db.publisherActivity.delete({
    where: {
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

  await evaluateInactiveStatus(db, {
    publisherId: activity.publisherId,
    congregationId,
    actorId,
    trigger: 'activity-deleted',
    triggeringActivity: null,
  })

  return activity
}
