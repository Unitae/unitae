import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function toggleBuildingActive(
  db: TransactionClient,
  id: number,
  congregationId: number,
  active: boolean,
  actorId: number,
) {
  const building = await db.building.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound key
      id_congregationId: { id, congregationId },
    },
    data: { active },
  })

  audit({
    action: active ? AuditAction.BuildingEnabled : AuditAction.BuildingDisabled,
    congregationId,
    actorId,
    entityType: 'Building',
    entityId: id,
  })

  return building
}
