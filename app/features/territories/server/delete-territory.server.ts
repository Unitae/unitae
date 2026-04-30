import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function deleteTerritory(db: TransactionClient, id: number, congregationId: number, actorId: number) {
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
