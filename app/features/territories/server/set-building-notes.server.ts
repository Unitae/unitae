import type { Building } from '~/database/generated/client'

import type { ScopedDb } from '~/shared/libs/db.server'

export function setBuildingNotes(
  db: ScopedDb,
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
