import type { TransactionClient } from '~/shared/infra/db.server'

export function createBoardSection(db: TransactionClient, data: { name: string; congregationId: number }) {
  return db.boardSection.create({ data })
}

export function updateBoardSection(
  db: TransactionClient,
  id: number,
  congregationId: number,
  data: { name: string },
) {
  return db.boardSection.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
    data,
  })
}
