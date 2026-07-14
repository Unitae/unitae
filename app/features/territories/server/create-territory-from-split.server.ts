import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

import { computeNextTerritoryNumber } from './compute-next-territory-number.server'

export interface CreateTerritoryFromSplitParams {
  type: TerritoryKind
  entranceIds: number[]
  congregationId: number
  actorId: number
}

export async function createTerritoryFromSplit(db: TransactionClient, params: CreateTerritoryFromSplitParams) {
  const number = await computeNextTerritoryNumber(db, params.congregationId, params.type)

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

  audit({
    action: AuditAction.TerritoryCreated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'Territory',
    entityId: territory.id,
  })

  return { ...territory, number }
}
