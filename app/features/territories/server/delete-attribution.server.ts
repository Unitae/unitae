import type { TransactionClient } from '~/shared/libs/db.server'

export async function deleteAttribution(db: TransactionClient, id: number, congregationId: number) {
  return db.attribution.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound key
      id_congregationId: { id, congregationId },
    },
    include: { publisher: true },
  })
}
