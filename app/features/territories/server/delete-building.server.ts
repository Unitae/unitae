import type { TransactionClient } from '~/shared/infra/db.server'

export function deleteBuilding(db: TransactionClient, id: number, congregationId: number) {
  return db.building.delete({
    where: {
      id_congregationId: { id, congregationId },
    },
  })
}
