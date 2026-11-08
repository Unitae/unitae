import type { Prisma } from '~/database/generated/client'

import type { TransactionClient } from '~/shared/infra/db.server'

const include = { entrances: { include: { buildings: true, territories: true } } } satisfies Prisma.BuildingInclude

/** The active buildings of a street, with their entrances and the territories those belong to. */
export async function getBuildings(
  db: TransactionClient,
  congregationId: number,
  zip: string,
  street: string,
): Promise<Prisma.BuildingGetPayload<{ include: typeof include }>[]> {
  const selectors: Prisma.BuildingWhereInput = { active: true, congregationId }

  if (zip != null) {
    selectors.zip = zip
  }

  if (street != null) {
    selectors.street = street
  }

  return await db.building.findMany({ where: selectors, include })
}
