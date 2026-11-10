import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

interface DeactivateBuildingsParams {
  buildingIds: number[]
  congregationId: number
  actorId: number
}

/**
 * Deactivates the chosen buildings that are still active, e.g. the ones « Manquants » found gone on site. Their
 * survey and notes stay; each can be reactivated. Returns how many changed.
 */
export async function deactivateBuildings(
  db: TransactionClient,
  { buildingIds, congregationId, actorId }: DeactivateBuildingsParams,
) {
  if (buildingIds.length === 0) return 0
  const changing = await db.building.findMany({
    where: { id: { in: buildingIds }, congregationId, active: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  if (changing.length === 0) return 0
  const ids = changing.map(building => building.id)

  await db.building.updateMany({ where: { id: { in: ids }, congregationId }, data: { active: false } })
  audit({
    action: AuditAction.BuildingsDeactivated,
    congregationId,
    actorId,
    entityType: 'Building',
    metadata: { buildingIds: ids },
  })
  return ids.length
}
