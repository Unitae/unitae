import type { Building } from '~/database/generated/client'

import type { TransactionClient } from '~/shared/infra/db.server'

export function setBuildingNotes(
  db: TransactionClient,
  buildingId: number,
  congregationId: number,
  { notes }: { notes: string },
): Promise<Building> {
  return db.building.update({
    where: { id_congregationId: { id: buildingId, congregationId } },
    data: { notes },
  })
}
