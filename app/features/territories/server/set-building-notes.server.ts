import type { Building } from '~/database/generated/client'

import { db } from '~/shared/libs/db.server'

export function setBuildingNotes(
  buildingId: number,
  { notes, importantNotes }: { notes: string; importantNotes: string },
): Promise<Building> {
  return db.building.update({
    where: { id: buildingId },
    data: {
      notes,
      importantNotes,
    },
  })
}
