import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface CreateTerritoryFromSplitParams {
  type: TerritoryKind
  entranceIds: number[]
  congregationId: number
}

export async function createTerritoryFromSplit(db: TransactionClient, params: CreateTerritoryFromSplitParams) {
  const count = await db.territory.count({
    where: { type: params.type, congregationId: params.congregationId },
  })

  let prefix = 'D'

  if (params.type === TerritoryKind.Hotel) {
    prefix = 'H'
  } else if (params.type === TerritoryKind.Univ) {
    prefix = 'U'
  } else if (params.type === TerritoryKind.Commerces) {
    prefix = 'C'
  } else if (params.type === TerritoryKind.Phone) {
    prefix = 'P'
  }

  const number = `${prefix}${String(count + 1).padStart(3, '0')}`

  const territory = await db.territory.create({
    data: {
      number,
      type: params.type,
      entrances: {
        connect: params.entranceIds.map(id => ({ id })),
      },
      congregationId: params.congregationId,
    },
  })

  return { ...territory, number }
}
