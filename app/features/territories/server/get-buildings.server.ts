import type { Building, Prisma } from '~/database/generated/client'

import { db } from '~/shared/libs/db.server'

export async function getBuildings(zip: string, street: string): Promise<Building[]> {
  const selectors: Prisma.BuildingWhereInput = { active: true }

  if (zip != null) {
    selectors.zip = zip
  }

  if (street != null) {
    selectors.street = street
  }

  return await db.building.findMany({
    where: selectors,
    include: { entrance: { include: { buildings: true } } },
  })
}
