import type { TransactionClient } from '~/shared/libs/db.server'

export async function countDelayedWorkingTerritories(db: TransactionClient) {
  return await db.territory.count({
    where: {
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
