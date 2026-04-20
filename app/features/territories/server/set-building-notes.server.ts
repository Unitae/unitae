import type { Building } from '~/database/generated/client'

import type { TransactionClient } from '~/shared/infra/db.server'

export function setBuildingNotes(
  db: TransactionClient,
  buildingId: number,
  { notes }: { notes: string },
): Promise<Building> {
  return db.building.update({
    where: { id: buildingId },
    data: { notes },
  })
}
