import type { Building } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/libs/db.server'

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

  const residentialEntrance = building.entrances[0]
  if (residentialEntrance != null) {
    // Update entrance-level fields
    await db.buildingEntrance.update({
      where: { id: residentialEntrance.id },
      data: {
        access: accessType,
        // biome-ignore lint/style/useNamingConvention: Name of the table in database
        isPMR: Boolean(formData.get('pmr')),
        isOpenEarly: Boolean(formData.get('doors')),
        isMailboxOpen: Boolean(formData.get('mailboxes')),
      },
    })

    // BuildingResidentialData
    await db.buildingResidentialData.upsert({
      where: { buildingId },
      update: { homes, phones, liberals },
      create: {
        building: { connect: { id: buildingId } },
        entrance: { connect: { id: residentialEntrance.id } },
        homes,
        phones,
        liberals,
        congregation: { connect: { id: 0 as number } },
      },
    })

    // BuildingAccess
    await db.buildingAccess.deleteMany({ where: { entranceId: residentialEntrance.id } })
    if (accessType != null) {
      await db.buildingAccess.create({
        data: {
          entrance: { connect: { id: residentialEntrance.id } },
          type: accessType,
          position: 0,
          congregation: { connect: { id: 0 as number } },
        },
      })
    }

    // Recalculate materialized aggregates on the residential entrance
    const aggregates = await db.buildingResidentialData.aggregate({
      where: { entranceId: residentialEntrance.id },
      _sum: { homes: true, phones: true, liberals: true },
    })
    await db.buildingEntrance.update({
      where: { id: residentialEntrance.id },
      data: {
        homes: aggregates._sum.homes,
        phones: aggregates._sum.phones,
        liberals: aggregates._sum.liberals,
      },
    })
  }

  // Manage typed entrances (commerce, hotel, campus, laundromat)
  const hasShops = Boolean(formData.get('shops'))
  const shopKind = formData.get('shopkinds') ? String(formData.get('shopkinds')) : ''
  await syncTypedEntrance(db, buildingId, 'commerce', hasShops, { shopKind })

  await syncTypedEntrance(db, buildingId, 'hotel', Boolean(formData.get('hotel')))
  await syncTypedEntrance(db, buildingId, 'campus', Boolean(formData.get('campus')))
  await syncTypedEntrance(db, buildingId, 'laundromat', Boolean(formData.get('landromat')))

  return building
}

async function syncTypedEntrance(
  db: TransactionClient,
  buildingId: number,
  kind: string,
  shouldExist: boolean,
  extraData: { shopKind?: string } = {},
) {
  const existing = await db.buildingEntrance.findFirst({
    where: { kind, buildings: { some: { id: buildingId } } },
  })

  if (shouldExist && existing == null) {
    await db.buildingEntrance.create({
      data: {
        kind,
        shopKind: extraData.shopKind ?? '',
        buildings: { connect: { id: buildingId } },
        congregation: { connect: { id: 0 as number } },
      },
    })
  } else if (shouldExist && existing != null) {
    await db.buildingEntrance.update({
      where: { id: existing.id },
      data: { shopKind: extraData.shopKind ?? existing.shopKind },
    })
  } else if (!shouldExist && existing != null) {
    await db.buildingEntrance.delete({ where: { id: existing.id } })
  }
}
