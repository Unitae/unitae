import type { TransactionClient } from '~/shared/infra/db.server'

export async function deleteTerritory(db: TransactionClient, id: number, congregationId: number) {
  return db.territory.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound key
      id_congregationId: { id, congregationId },
    },
  })
}
