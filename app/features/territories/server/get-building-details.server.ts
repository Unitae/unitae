import { db } from '~/shared/libs/db.server'
import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'

export async function getBuildingDetails(buildingId: number): Promise<DetailedBuilding | null> {
  return await db.building.findUnique({
    where: { id: buildingId },
    include: {
      entrance: { include: { buildings: true, territories: true } },
    },
  })
}
