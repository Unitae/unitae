import type { ScopedDb } from '~/shared/libs/db.server'

export async function countDelayedWorkingTerritories(db: ScopedDb) {
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
