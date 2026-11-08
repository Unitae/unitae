import type { Building } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { BuildingProspectionInput } from '~/features/territories/schemas/building-prospection.schema'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { recalculateEntranceAggregates, recalculateEntranceCentroid } from './update-buildings-in-entrance.server'

export async function setBuildingProspectionData(
  db: TransactionClient,
  buildingId: number,
  congregationId: number,
  input: BuildingProspectionInput,
  actorId: number,
): Promise<Building> {
  const prospectionDate = input['prospection-date']

  const building = await db.building.update({
    where: { id_congregationId: { id: buildingId, congregationId } },
    data: { prospectionDate: prospectionDate ? new Date(prospectionDate) : null },
    include: {
      entrances: {
        where: { kind: EntranceKind.Residential },
        orderBy: { id: 'asc' },
        take: 1,
        include: { buildings: { select: { id: true } } },
      },
    },
  })

  const hasResidential = Boolean(input['has-residential'])
  const residentialEntrance = building.entrances[0]

  if (!hasResidential && residentialEntrance != null) {
    await removeResidentialEntrance(db, buildingId, congregationId, residentialEntrance)
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
    await saveResidentialEntrance(db, buildingId, congregationId, currentResidentialEntrance.id, input)
  }

  // Manage commerce entrances (supports multiple). A shop without a category is left out, with its notes.
  const notes = input['commerce-notes']
  const shops = input.shopkinds.map((kind, index) => ({ kind, notes: notes[index] ?? '' })).filter(({ kind }) => kind)
  await syncCommerceEntrances(
    db,
    buildingId,
    congregationId,
    shops.map(({ kind }) => kind),
    shops.map(shop => shop.notes),
  )

  // Manage unique typed entrances (hotel, campus, laundromat)
  await syncUniqueEntrance(db, buildingId, congregationId, EntranceKind.Hotel, Boolean(input.hotel))
  await syncUniqueEntrance(db, buildingId, congregationId, EntranceKind.Campus, Boolean(input.campus))
  await syncUniqueEntrance(db, buildingId, congregationId, EntranceKind.Laundromat, Boolean(input.landromat))

  audit({
    action: AuditAction.BuildingProspectionUpdated,
    congregationId,
    actorId,
    entityType: 'Building',
    entityId: buildingId,
  })

  return building
}

/** The residential entrance's access and notes, and this building's own figures, then the entrance totals. */
async function saveResidentialEntrance(
  db: TransactionClient,
  buildingId: number,
  congregationId: number,
  entranceId: number,
  input: BuildingProspectionInput,
) {
  const homes = input.homes ? Number(input.homes) : null
  const phones = input.phones ? Number(input.phones) : null
  const liberals = input.liberals ? Number(input.liberals) : null
  const accessType = input.access ? Number(input.access) : null

  await db.buildingEntrance.update({
    where: { id_congregationId: { id: entranceId, congregationId } },
    data: {
      access: accessType,
      isPMR: Boolean(input.pmr),
      isOpenEarly: Boolean(input.doors),
      isMailboxOpen: Boolean(input.mailboxes),
      notes: input['residential-notes'],
    },
  })

  // Figures left on another entrance (an older link that never moved them) come back to this one, and that
  // entrance's totals drop them.
  const recorded = await db.buildingResidentialData.findUnique({ where: { buildingId }, select: { entranceId: true } })
  await db.buildingResidentialData.upsert({
    where: { buildingId },
    update: { homes, phones, liberals, entranceId },
    create: {
      building: { connect: { id: buildingId } },
      entrance: { connect: { id: entranceId } },
      homes,
      phones,
      liberals,
      congregation: { connect: { id: congregationId } },
    },
  })

  await db.buildingAccess.deleteMany({ where: { entranceId, congregationId } })
  if (accessType != null) {
    await db.buildingAccess.create({
      data: {
        entrance: { connect: { id: entranceId } },
        type: accessType,
        position: 0,
        congregation: { connect: { id: congregationId } },
      },
    })
  }

  await recalculateEntranceAggregates(db, entranceId, congregationId)
  if (recorded != null && recorded.entranceId !== entranceId) {
    await recalculateEntranceAggregates(db, recorded.entranceId, congregationId)
  }
}

/** Removes the building's residential entrance. A shared one stays with the other buildings: only this one leaves. */
async function removeResidentialEntrance(
  db: TransactionClient,
  buildingId: number,
  congregationId: number,
  entrance: { id: number; buildings: { id: number }[] },
) {
  const where = { id_congregationId: { id: entrance.id, congregationId } }
  if (entrance.buildings.some(({ id }) => id !== buildingId)) {
    await db.buildingResidentialData.deleteMany({ where: { buildingId, congregationId } })
    await db.buildingEntrance.update({ where, data: { buildings: { disconnect: { id: buildingId } } } })
    await recalculateEntranceAggregates(db, entrance.id, congregationId)
    await recalculateEntranceCentroid(db, entrance.id, congregationId)
    return
  }
  await db.buildingResidentialData.deleteMany({ where: { entranceId: entrance.id, congregationId } })
  await db.buildingAccess.deleteMany({ where: { entranceId: entrance.id, congregationId } })
  await db.buildingEntrance.delete({ where })
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
