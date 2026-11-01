import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

import { assertGroupLeaders } from './group-leaders.server'
import { joinLedGroup } from './update-group.server'

export interface CreatePublisherGroupParams {
  name: string
  address: string
  responsibleId: number
  deputyId: number | null
  congregationId: number
  actorId: number
}

/** Throws a ValidationError on the field at fault when the chosen leaders cannot lead a group. */
export async function createPublisherGroup(db: TransactionClient, params: CreatePublisherGroupParams) {
  await assertGroupLeaders(db, params.congregationId, {
    responsibleId: params.responsibleId,
    deputyId: params.deputyId,
  })

  const group = await db.publisherGroup.create({
    data: {
      name: params.name,
      adress: params.address,
      deputyId: params.deputyId,
      responsibleId: params.responsibleId,
      congregationId: params.congregationId,
    },
  })

  await joinLedGroup(db, group.id, params.congregationId, params.actorId, params)

  audit({
    action: AuditAction.PublisherGroupCreated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'PublisherGroup',
    entityId: group.id,
  })

  return group
}

export async function deletePublisherGroup(db: TransactionClient, id: number, congregationId: number, actorId: number) {
  const group = await db.publisherGroup.delete({
    where: {
      id_congregationId: { id, congregationId },
    },
  })

  audit({
    action: AuditAction.PublisherGroupDeleted,
    congregationId,
    actorId,
    entityType: 'PublisherGroup',
    entityId: id,
  })

  return group
}
