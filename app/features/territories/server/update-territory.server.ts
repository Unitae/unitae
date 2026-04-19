import type { TransactionClient } from '~/shared/infra/db.server'

export interface UpdateTerritoryParams {
  entranceIds: number[]
  notes: string
}

export async function updateTerritory(
  db: TransactionClient,
  id: number,
  congregationId: number,
  params: UpdateTerritoryParams,
) {
  return db.territory.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound key
      id_congregationId: { id, congregationId },
    },
    data: {
      entrances: {
        set: params.entranceIds.map(id => ({ id })),
      },
      notes: params.notes,
    },
  })
}
