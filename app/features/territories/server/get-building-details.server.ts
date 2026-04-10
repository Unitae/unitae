import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import type { ScopedDb } from '~/shared/libs/db.server'

export async function getBuildingDetails(db: ScopedDb, buildingId: number): Promise<DetailedBuilding | null> {
  return await db.building.findUnique({
    where: { id: buildingId },
    include: {
      entrance: { include: { buildings: true, territories: true } },
    },
  })
}
