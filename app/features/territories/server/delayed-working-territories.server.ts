import { db } from '~/shared/libs/db.server'

export async function countDelayedWorkingTerritories() {
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
