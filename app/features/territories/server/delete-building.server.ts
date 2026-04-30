import type { TransactionClient } from '~/shared/infra/db.server'

export function deleteBuilding(db: TransactionClient, id: number, congregationId: number) {
  return db.building.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound key
      id_congregationId: { id, congregationId },
    },
  })
}
