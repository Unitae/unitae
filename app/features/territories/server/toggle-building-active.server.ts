import type { TransactionClient } from '~/shared/infra/db.server'

export async function toggleBuildingActive(db: TransactionClient, id: number, congregationId: number, active: boolean) {
  return db.building.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound key
      id_congregationId: { id, congregationId },
    },
    data: { active },
  })
}
