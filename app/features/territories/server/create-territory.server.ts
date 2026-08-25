import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface CreateTerritoryParams {
  number: string
  type: TerritoryKindKey
  entranceIds: number[]
  congregationId: number
  actorId: number
}

export async function createTerritory(db: TransactionClient, params: CreateTerritoryParams) {
  const territory = await db.territory.create({
    data: {
      number: params.number,
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

  return territory
}
