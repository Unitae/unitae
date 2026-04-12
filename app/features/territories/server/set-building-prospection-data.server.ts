import type { Building, Prisma } from '~/database/generated/client'
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

  // Old fields (backward compat — removed in Phase 4c)
  const data: Prisma.BuildingUpdateInput = {}
  data.homes = homes
  data.phones = phones
  data.liberals = liberals
  data.hasShops = Boolean(formData.get('shops'))
  data.shopKind = formData.get('shopkinds') ? String(formData.get('shopkinds')) : ''
  data.hasCampus = Boolean(formData.get('campus'))
  data.hasHotel = Boolean(formData.get('hotel'))
  data.hasLandromat = Boolean(formData.get('landromat'))

  const prospectionDate = formData.get('prospection-date')
  data.prospectionDate = prospectionDate ? new Date(prospectionDate.toString()) : null

  const building = await db.building.update({
    where: { id: buildingId },
    data,
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

  return building
}
