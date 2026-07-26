import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { computeEntranceCentroid } from './compute-entrance-centroid'

async function recalculateEntranceAggregates(db: TransactionClient, entranceId: number, congregationId: number) {
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

export async function updateBuildingsInEntrance(
  db: TransactionClient,
  entranceId: number,
  buildingIds: number[],
  congregationId: number,
) {
  const entrance = await db.buildingEntrance.findUnique({
    where: { id_congregationId: { id: entranceId, congregationId } },
    include: { buildings: true, accesses: { orderBy: { position: 'asc' } } },
  })

  if (entrance == null) {
    return
  }

  logger.info(`Trying to update entrance ${entranceId} with buildings ${buildingIds.join(', ')}.`)

  const newBuildingIds = buildingIds.filter(
    buildingId => !entrance.buildings.some(building => building.id === buildingId),
  )
  if (newBuildingIds.length > 0) {
    logger.info(`Buildings ${newBuildingIds.join(', ')} will be added to entrance ${entranceId}`)
  }

  const disconnectBuildingIds = entrance.buildings
    .map(building => building.id)
    .filter(buildingId => !buildingIds.includes(buildingId))
  if (disconnectBuildingIds.length > 0) {
    logger.info(`Buildings ${disconnectBuildingIds.join(', ')} will be removed from entrance ${entranceId}`)
  }

  try {
    // Update current entrance.
    await db.buildingEntrance.update({
      where: { id_congregationId: { id: entrance.id, congregationId } },
      data: {
        buildings: {
          connect: newBuildingIds.map(buildingId => ({ id: buildingId })),
          disconnect: disconnectBuildingIds.map(buildingId => ({ id: buildingId })),
        },
      },
    })

    // Create new entrance for each disconnected building.
    for (const disconnectBuildingId of disconnectBuildingIds) {
      const newEntrance = await db.buildingEntrance.create({
        data: {
          kind: entrance.kind,
          access: entrance.access,
          isMailboxOpen: entrance.isMailboxOpen,
          isPMR: entrance.isPMR,
          isOpenEarly: entrance.isOpenEarly,
          buildings: { connect: { id: disconnectBuildingId } },
          congregationId,
        },
      })

      // Clone BuildingAccess rows for the new entrance
      for (const access of entrance.accesses) {
        await db.buildingAccess.create({
          data: {
            entrance: { connect: { id: newEntrance.id } },
            type: access.type,
            position: access.position,
            congregation: { connect: { id: congregationId } },
          },
        })
      }

      // Reassign BuildingResidentialData to the new entrance
      await db.buildingResidentialData.updateMany({
        where: { buildingId: disconnectBuildingId, congregationId },
        data: { entranceId: newEntrance.id },
      })

      // Recalculate aggregates and centroid on the new entrance
      await recalculateEntranceAggregates(db, newEntrance.id, congregationId)
      await recalculateEntranceCentroid(db, newEntrance.id, congregationId)
    }

    // Recalculate aggregates and centroid on the original entrance
    await recalculateEntranceAggregates(db, entranceId, congregationId)
    await recalculateEntranceCentroid(db, entranceId, congregationId)

    logger.info(`Update of entrance ${entranceId} with buildings ${buildingIds.join(', ')} succeed.`)
  } catch (error) {
    logger.error(error)
  }

  // Remove empty entrances.
  await db.buildingEntrance.deleteMany({
    where: { congregationId, buildings: { none: {} } },
  })
}
