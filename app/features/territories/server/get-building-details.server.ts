import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import type { TransactionClient } from '~/shared/libs/db.server'

export async function getBuildingDetails(db: TransactionClient, buildingId: number): Promise<DetailedBuilding | null> {
  return await db.building.findUnique({
    where: { id: buildingId },
    include: {
      entrance: { include: { buildings: true, territories: true } },
    },
  })
}
