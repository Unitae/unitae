import type { Building, Prisma } from '~/database/generated/client'

import type { TransactionClient } from '~/shared/libs/db.server'

export async function getBuildings(
  db: TransactionClient,
  congregationId: number,
  zip: string,
  street: string,
): Promise<Building[]> {
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

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
