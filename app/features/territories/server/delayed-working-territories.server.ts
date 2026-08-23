import type { TransactionClient } from '~/shared/infra/db.server'

export async function countDelayedWorkingTerritories(db: TransactionClient, congregationId: number) {
  return await db.territory.count({
    where: {
      congregationId,
      attributions: {
        some: {
          endDate: null,
          pausedAt: null,
          lateDate: {
            lte: new Date(),
          },
        },
      },
    },
  })
}
