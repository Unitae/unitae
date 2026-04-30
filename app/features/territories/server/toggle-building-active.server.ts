import type { TransactionClient } from '~/shared/infra/db.server'

export function toggleBuildingActive(db: TransactionClient, id: number, congregationId: number, active: boolean) {
  return db.building.update({
    where: {
      id_congregationId: { id, congregationId },
    },
    data: { active },
  })
}
