import type { ScopedDb } from '~/shared/libs/db.server'

export async function countActiveWorkingTerritories(db: ScopedDb) {
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
