import type { Building } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function setBuildingProspectionData(
  db: TransactionClient,
  buildingId: number,
  formData: FormData,
): Promise<Building> {
  const homes = formData.get('homes') ? Number(formData.get('homes')) : null
  const phones = formData.get('phones') ? Number(formData.get('phones')) : null
  const liberals = formData.get('liberals') ? Number(formData.get('liberals')) : null
  const accessType = formData.get('access') ? Number(formData.get('access')) : null

  const prospectionDate = formData.get('prospection-date')

  const building = await db.building.update({
    where: { id: buildingId },
    data: { prospectionDate: prospectionDate ? new Date(prospectionDate.toString()) : null },
    include: { entrances: { where: { kind: 'residential' }, take: 1 } },
  })

  const { congregationId } = building
  const hasResidential = Boolean(formData.get('has-residential'))
  const residentialEntrance = building.entrances[0]

  // Remove residential entrance if unchecked
  if (!hasResidential && residentialEntrance != null) {
    await db.buildingResidentialData.deleteMany({ where: { entranceId: residentialEntrance.id } })
    await db.buildingAccess.deleteMany({ where: { entranceId: residentialEntrance.id } })
    await db.buildingEntrance.delete({ where: { id: residentialEntrance.id } })
  }

  // Create residential entrance if checked but doesn't exist
  if (hasResidential && residentialEntrance == null) {
    const newEntrance = await db.buildingEntrance.create({
      data: {
        kind: 'residential',
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
      where: { id: currentResidentialEntrance.id },
      data: {
        access: accessType,
        // biome-ignore lint/style/useNamingConvention: Name of the table in database
        isPMR: Boolean(formData.get('pmr')),
        isOpenEarly: Boolean(formData.get('doors')),
        isMailboxOpen: Boolean(formData.get('mailboxes')),
        notes: formData.get('residential-notes')?.toString() ?? '',
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
    await db.buildingAccess.deleteMany({ where: { entranceId: currentResidentialEntrance.id } })
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
      where: { entranceId: currentResidentialEntrance.id },
      _sum: { homes: true, phones: true, liberals: true },
    })
    await db.buildingEntrance.update({
      where: { id: currentResidentialEntrance.id },
      data: {
        homes: aggregates._sum.homes,
        phones: aggregates._sum.phones,
        liberals: aggregates._sum.liberals,
      },
    })
  }

  // Manage commerce entrances (supports multiple)
  const commerceShopKinds = formData.getAll('shopkinds').map(String).filter(Boolean)
  const commerceNotes = formData.getAll('commerce-notes').map(String)
  await syncCommerceEntrances(db, buildingId, congregationId, commerceShopKinds, commerceNotes)

  // Manage unique typed entrances (hotel, campus, laundromat)
  await syncUniqueEntrance(db, buildingId, congregationId, 'hotel', Boolean(formData.get('hotel')))
  await syncUniqueEntrance(db, buildingId, congregationId, 'campus', Boolean(formData.get('campus')))
  await syncUniqueEntrance(db, buildingId, congregationId, 'laundromat', Boolean(formData.get('landromat')))

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
    where: { kind: 'commerce', buildings: { some: { id: buildingId } } },
    orderBy: { id: 'asc' },
  })

  // Update existing entrances or delete extras
  for (let i = 0; i < existing.length; i++) {
    if (i < shopKinds.length) {
      await db.buildingEntrance.update({
        where: { id: existing[i].id },
        data: { shopKind: shopKinds[i], notes: notes[i] ?? '' },
      })
    } else {
      await db.buildingEntrance.delete({ where: { id: existing[i].id } })
    }
  }

  // Create new entrances for remaining shopKinds
  for (let i = existing.length; i < shopKinds.length; i++) {
    await db.buildingEntrance.create({
      data: {
        kind: 'commerce',
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
  kind: string,
  shouldExist: boolean,
) {
  const existing = await db.buildingEntrance.findFirst({
    where: { kind, buildings: { some: { id: buildingId } } },
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
    await db.buildingEntrance.delete({ where: { id: existing.id } })
  }
}
