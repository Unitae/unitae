import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface CreateTerritoryParams {
  number: string
  type: string
  entranceIds: number[]
  congregationId: number
}

export async function createTerritory(db: TransactionClient, params: CreateTerritoryParams, actorId: number) {
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
    actorId,
    entityType: 'Territory',
    entityId: territory.id,
    metadata: { number: params.number, type: params.type },
  })

  return territory
}
