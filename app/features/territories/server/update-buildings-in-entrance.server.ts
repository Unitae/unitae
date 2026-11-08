import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { computeEntranceCentroid } from './compute-entrance-centroid'

/** The entrance's household, phone and liberal totals: the sum of each of its buildings' own figures. */
export async function recalculateEntranceAggregates(db: TransactionClient, entranceId: number, congregationId: number) {
  const aggregates = await db.buildingResidentialData.aggregate({
    where: { entranceId, congregationId },
    _sum: { homes: true, phones: true, liberals: true },
  })
  await db.buildingEntrance.update({
    where: { id_congregationId: { id: entranceId, congregationId } },
    data: {
      homes: aggregates._sum.homes,
      phones: aggregates._sum.phones,
      liberals: aggregates._sum.liberals,
    },
  })
}

export async function recalculateEntranceCentroid(db: TransactionClient, entranceId: number, congregationId: number) {
  const buildings = await db.building.findMany({
    where: { congregationId, entrances: { some: { id: entranceId } } },
    select: { latitude: true, longitude: true },
  })
  const centroid = computeEntranceCentroid(buildings)
  await db.buildingEntrance.update({
    where: { id_congregationId: { id: entranceId, congregationId } },
    data: {
      latitude: centroid?.latitude ?? null,
      longitude: centroid?.longitude ?? null,
    },
  })
}

/**
 * Sets which buildings share a residential entrance. A building can only have one residential entrance: one that
 * joins leaves its own, taking its figures along; one that leaves gets an entrance of its own, a copy of the shared
 * one (access, notes, territories) holding its figures. Totals and positions follow on every entrance touched.
 * Errors propagate, so the caller's transaction rolls the whole change back.
 */
export async function updateBuildingsInEntrance(
  db: TransactionClient,
  entranceId: number,
  buildingIds: number[],
  congregationId: number,
  actorId: number,
) {
  const entrance = await db.buildingEntrance.findUnique({
    where: { id_congregationId: { id: entranceId, congregationId } },
    include: { buildings: true, territories: true, accesses: { orderBy: { position: 'asc' } } },
  })

  if (entrance == null) {
    return
  }

  const joining = buildingIds.filter(buildingId => !entrance.buildings.some(building => building.id === buildingId))
  const leaving = entrance.buildings
    .map(building => building.id)
    .filter(buildingId => !buildingIds.includes(buildingId))
  logger.info(`Entrance ${entranceId}: buildings ${joining.join(', ')} join, ${leaving.join(', ')} leave.`)

  const formerEntranceIds = new Set<number>()
  for (const buildingId of joining) {
    const formerEntrances = await db.buildingEntrance.findMany({
      where: {
        congregationId,
        kind: EntranceKind.Residential,
        id: { not: entranceId },
        buildings: { some: { id: buildingId } },
      },
      select: { id: true },
    })
    for (const former of formerEntrances) {
      formerEntranceIds.add(former.id)
      await db.buildingEntrance.update({
        where: { id_congregationId: { id: former.id, congregationId } },
        data: { buildings: { disconnect: { id: buildingId } } },
      })
    }
    // Moved before any former entrance is removed: deleting an entrance cascades to the figures it holds.
    await db.buildingResidentialData.updateMany({ where: { buildingId, congregationId }, data: { entranceId } })
  }

  await db.buildingEntrance.update({
    where: { id_congregationId: { id: entrance.id, congregationId } },
    data: {
      buildings: {
        connect: joining.map(buildingId => ({ id: buildingId })),
        disconnect: leaving.map(buildingId => ({ id: buildingId })),
      },
    },
  })

  for (const buildingId of leaving) {
    const own = await db.buildingEntrance.create({
      data: {
        kind: entrance.kind,
        access: entrance.access,
        isMailboxOpen: entrance.isMailboxOpen,
        isPMR: entrance.isPMR,
        isOpenEarly: entrance.isOpenEarly,
        notes: entrance.notes,
        buildings: { connect: { id: buildingId } },
        territories: { connect: entrance.territories.map(territory => ({ id: territory.id })) },
        congregationId,
      },
    })
    for (const access of entrance.accesses) {
      await db.buildingAccess.create({
        data: { entranceId: own.id, type: access.type, position: access.position, congregationId },
      })
    }
    await db.buildingResidentialData.updateMany({ where: { buildingId, congregationId }, data: { entranceId: own.id } })
    await recalculateEntranceAggregates(db, own.id, congregationId)
    await recalculateEntranceCentroid(db, own.id, congregationId)
  }

  for (const id of [entranceId, ...formerEntranceIds]) {
    await recalculateEntranceAggregates(db, id, congregationId)
    await recalculateEntranceCentroid(db, id, congregationId)
  }

  // Remove empty entrances.
  await db.buildingEntrance.deleteMany({
    where: { congregationId, buildings: { none: {} } },
  })

  audit({
    action: AuditAction.BuildingEntranceSharingChanged,
    congregationId,
    actorId,
    entityType: 'BuildingEntrance',
    entityId: entranceId,
    metadata: { joined: joining, left: leaving },
  })
}
