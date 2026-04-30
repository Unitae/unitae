import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface CreatePublisherGroupParams {
  name: string
  address: string
  responsibleId: number
  deputyId: number | null
  congregationId: number
  actorId: number
}

export async function createPublisherGroup(db: TransactionClient, params: CreatePublisherGroupParams) {
  const membersToConnect = [{ id: params.responsibleId }]
  if (params.deputyId != null) membersToConnect.push({ id: params.deputyId })

  const group = await db.publisherGroup.create({
    data: {
      name: params.name,
      adress: params.address,
      deputyId: params.deputyId,
      responsibleId: params.responsibleId,
      members: { connect: membersToConnect },
      congregationId: params.congregationId,
    },
  })

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
      // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
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
