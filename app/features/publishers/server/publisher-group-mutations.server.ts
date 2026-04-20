import type { TransactionClient } from '~/shared/infra/db.server'

export interface CreatePublisherGroupParams {
  name: string
  address: string
  responsibleId: number
  deputyId: number | null
  congregationId: number
}

export function createPublisherGroup(db: TransactionClient, params: CreatePublisherGroupParams) {
  const membersToConnect = [{ id: params.responsibleId }]
  if (params.deputyId != null) membersToConnect.push({ id: params.deputyId })

  return db.publisherGroup.create({
    data: {
      name: params.name,
      adress: params.address,
      deputyId: params.deputyId,
      responsibleId: params.responsibleId,
      members: { connect: membersToConnect },
      congregationId: params.congregationId,
    },
  })
}

export function deletePublisherGroup(db: TransactionClient, id: number, congregationId: number) {
  return db.publisherGroup.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
      id_congregationId: { id, congregationId },
    },
  })
}
