import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Deletes a territory never attributed. One attributed even once stays: its attributions are its history, counted
 * in the S-13 register, and the database keeps them (`ON DELETE RESTRICT`).
 */
export async function deleteTerritory(db: TransactionClient, id: number, congregationId: number, actorId: number) {
  const attributions = await db.attribution.count({ where: { territoryId: id, congregationId } })
  if (attributions > 0) throw new ConflictError('territory_has_history')

  const territory = await db.territory.delete({
    where: {
      id_congregationId: { id, congregationId },
    },
  })

  audit({
    action: AuditAction.TerritoryDeleted,
    congregationId,
    actorId,
    entityType: 'Territory',
    entityId: id,
  })

  return territory
}
