import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function deleteBuilding(db: TransactionClient, id: number, congregationId: number, actorId: number) {
  const building = await db.building.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound key
      id_congregationId: { id, congregationId },
    },
  })

  audit({
    action: AuditAction.BuildingDeleted,
    congregationId,
    actorId,
    entityType: 'Building',
    entityId: id,
  })

  return building
}
