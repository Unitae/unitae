import type { Building } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { BuildingProspectionInput } from '~/features/territories/schemas/building-prospection.schema'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function setBuildingProspectionData(
  db: TransactionClient,
  buildingId: number,
  congregationId: number,
  input: BuildingProspectionInput,
): Promise<Building> {
  const homes = input.homes ? Number(input.homes) : null
  const phones = input.phones ? Number(input.phones) : null
  const liberals = input.liberals ? Number(input.liberals) : null
  const accessType = input.access ? Number(input.access) : null

  const prospectionDate = input['prospection-date']

  const building = await db.building.update({
    where: { id_congregationId: { id: buildingId, congregationId } },
    data: { prospectionDate: prospectionDate ? new Date(prospectionDate) : null },
    include: { entrances: { where: { kind: EntranceKind.Residential }, take: 1 } },
  })

  const hasResidential = Boolean(input['has-residential'])
  const residentialEntrance = building.entrances[0]

  // Remove residential entrance if unchecked
  if (!hasResidential && residentialEntrance != null) {
    await db.buildingResidentialData.deleteMany({ where: { entranceId: residentialEntrance.id, congregationId } })
    await db.buildingAccess.deleteMany({ where: { entranceId: residentialEntrance.id, congregationId } })
    await db.buildingEntrance.delete({ where: { id_congregationId: { id: residentialEntrance.id, congregationId } } })
  }

  // Create residential entrance if checked but doesn't exist
  if (hasResidential && residentialEntrance == null) {
    const newEntrance = await db.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        buildings: { connect: { id: buildingId } },
        congregation: { connect: { id: congregationId } },
      },
    })
    building.entrances[0] = newEntrance as typeof residentialEntrance
  }

  const currentResidentialEntrance = hasResidential ? (building.entrances[0] ?? null) : null
  if (currentResidentialEntrance != null) {
    // Update entrance-level fields
    await db.buildingEntrance.update({
      where: { id_congregationId: { id: currentResidentialEntrance.id, congregationId } },
      data: {
        access: accessType,
        isPMR: Boolean(input.pmr),
        isOpenEarly: Boolean(input.doors),
        isMailboxOpen: Boolean(input.mailboxes),
        notes: input['residential-notes'],
      },
    })

    // BuildingResidentialData
    await db.buildingResidentialData.upsert({
      where: { buildingId },
      update: { homes, phones, liberals },
      create: {
        building: { connect: { id: buildingId } },
        entrance: { connect: { id: currentResidentialEntrance.id } },
        homes,
        phones,
        liberals,
        congregation: { connect: { id: congregationId } },
      },
    })

    // BuildingAccess
    await db.buildingAccess.deleteMany({ where: { entranceId: currentResidentialEntrance.id, congregationId } })
    if (accessType != null) {
      await db.buildingAccess.create({
        data: {
          entrance: { connect: { id: currentResidentialEntrance.id } },
          type: accessType,
          position: 0,
          congregation: { connect: { id: congregationId } },
        },
      })
    }

    // Recalculate materialized aggregates on the residential entrance
    const aggregates = await db.buildingResidentialData.aggregate({
      where: { entranceId: currentResidentialEntrance.id, congregationId },
      _sum: { homes: true, phones: true, liberals: true },
    })
    await db.buildingEntrance.update({
      where: { id_congregationId: { id: currentResidentialEntrance.id, congregationId } },
      data: {
        homes: aggregates._sum.homes,
        phones: aggregates._sum.phones,
        liberals: aggregates._sum.liberals,
      },
    })
  }

  // Manage commerce entrances (supports multiple)
  const commerceShopKinds = input.shopkinds.filter(Boolean)
  const commerceNotes = input['commerce-notes']
  await syncCommerceEntrances(db, buildingId, congregationId, commerceShopKinds, commerceNotes)

  // Manage unique typed entrances (hotel, campus, laundromat)
  await syncUniqueEntrance(db, buildingId, congregationId, EntranceKind.Hotel, Boolean(input.hotel))
  await syncUniqueEntrance(db, buildingId, congregationId, EntranceKind.Campus, Boolean(input.campus))
  await syncUniqueEntrance(db, buildingId, congregationId, EntranceKind.Laundromat, Boolean(input.landromat))

  return building
}

async function syncCommerceEntrances(
  db: TransactionClient,
  buildingId: number,
  congregationId: number,
  shopKinds: string[],
  notes: string[],
) {
  const existing = await db.buildingEntrance.findMany({
    where: { kind: EntranceKind.Commerce, congregationId, buildings: { some: { id: buildingId } } },
    orderBy: { id: 'asc' },
  })

  // Update existing entrances or delete extras
  for (let i = 0; i < existing.length; i++) {
    if (i < shopKinds.length) {
      await db.buildingEntrance.update({
        where: { id_congregationId: { id: existing[i].id, congregationId } },
        data: { shopKind: shopKinds[i], notes: notes[i] ?? '' },
      })
    } else {
      await db.buildingEntrance.delete({ where: { id_congregationId: { id: existing[i].id, congregationId } } })
    }
  }

  // Create new entrances for remaining shopKinds
  for (let i = existing.length; i < shopKinds.length; i++) {
    await db.buildingEntrance.create({
      data: {
        kind: EntranceKind.Commerce,
        shopKind: shopKinds[i],
        notes: notes[i] ?? '',
        buildings: { connect: { id: buildingId } },
        congregation: { connect: { id: congregationId } },
      },
    })
  }
}

async function syncUniqueEntrance(
  db: TransactionClient,
  buildingId: number,
  congregationId: number,
  kind: EntranceKind,
  shouldExist: boolean,
) {
  const existing = await db.buildingEntrance.findFirst({
    where: { kind, congregationId, buildings: { some: { id: buildingId } } },
  })

  if (shouldExist && existing == null) {
    await db.buildingEntrance.create({
      data: {
        kind,
        buildings: { connect: { id: buildingId } },
        congregation: { connect: { id: congregationId } },
      },
    })
  } else if (!shouldExist && existing != null) {
    await db.buildingEntrance.delete({ where: { id_congregationId: { id: existing.id, congregationId } } })
  }
}
