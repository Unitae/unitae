import type { TransactionClient } from '~/shared/infra/db.server'

export function createBoardSection(db: TransactionClient, data: { name: string; congregationId: number }) {
  return db.boardSection.create({ data })
}

export function updateBoardSection(db: TransactionClient, id: number, congregationId: number, data: { name: string }) {
  return db.boardSection.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id, congregationId },
    },
    data,
  })
}

export async function reorderBoardSections(
  db: TransactionClient,
  congregationId: number,
  orderedIds: number[],
): Promise<void> {
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_001, congregationId)

  for (let i = 0; i < orderedIds.length; i++) {
    await db.boardSection.update({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: orderedIds[i], congregationId },
      },
      data: { order: i * 5 },
    })
  }
}
