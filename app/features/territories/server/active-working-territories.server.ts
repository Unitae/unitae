import { db } from '~/shared/libs/db.server'

export async function countActiveWorkingTerritories() {
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
