import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface UpdateTerritoryParams {
  entranceIds: number[]
  notes: string
}

export async function updateTerritory(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateTerritoryParams,
) {
  const territory = await db.territory.update({
    where: {
      id_congregationId: { id, congregationId },
    },
    data: {
      entrances: {
        set: params.entranceIds.map(id => ({ id })),
      },
      notes: params.notes,
    },
  })

  audit({
    action: AuditAction.TerritoryUpdated,
    congregationId,
    actorId,
    entityType: 'Territory',
    entityId: id,
  })

  return territory
}
