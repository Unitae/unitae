import type { TransactionClient } from '~/shared/infra/db.server'

export interface UpdateGroupParams {
  name: string
  address: string
  responsibleId: number
  deputyId: number | null
}

export async function updateGroup(
  db: TransactionClient,
  groupId: number,
  congregationId: number,
  params: UpdateGroupParams,
) {
  const membersToConnect = [{ id: params.responsibleId }]
  if (params.deputyId != null) membersToConnect.push({ id: params.deputyId })

  return db.publisherGroup.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
      id_congregationId: { id: groupId, congregationId },
    },
    data: {
      name: params.name,
      adress: params.address,
      deputyId: params.deputyId,
      responsibleId: params.responsibleId,
      members: { connect: membersToConnect },
    },
  })
}
