import type { TransactionClient } from '~/shared/infra/db.server'

export interface CreateTerritoryParams {
  number: string
  type: string
  entranceIds: number[]
  congregationId: number
}

export async function createTerritory(db: TransactionClient, params: CreateTerritoryParams) {
  return db.territory.create({
    data: {
      number: params.number,
      type: params.type,
      entrances: {
        connect: params.entranceIds.map(id => ({ id })),
      },
      congregationId: params.congregationId,
    },
  })
}
