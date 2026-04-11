import type { TransactionClient } from '~/shared/libs/db.server'

export async function countActiveWorkingTerritories(db: TransactionClient) {
  return await db.territory.count({
    where: {
      attributions: {
        some: {
          endDate: null,
          lateDate: {
            gte: new Date(),
          },
        },
      },
    },
  })
}
