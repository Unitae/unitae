import type { TransactionClient } from '~/shared/libs/db.server'

export async function countDelayedWorkingTerritories(db: TransactionClient, congregationId: number) {
  return await db.territory.count({
    where: {
      congregationId,
      attributions: {
        some: {
          endDate: null,
          lateDate: {
            lte: new Date(),
          },
        },
      },
    },
  })
}
