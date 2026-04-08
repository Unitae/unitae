import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

export async function updateBuildingsInEntrance(entranceId: number, buildingIds: number[], congregationId: number) {
  const entrance = await db.buildingEntrance.findUnique({
    where: { id: entranceId },
    include: { buildings: true },
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
    await db.$transaction(async tx => {
      // Update current entrance.
      await tx.buildingEntrance.update({
        where: { id: entrance.id },
        data: {
          buildings: {
            connect: newBuildingIds.map(buildingId => ({ id: buildingId })),
            disconnect: disconnectBuildingIds.map(buildingId => ({ id: buildingId })),
          },
        },
      })

      // Create new entrance if needed.
      if (disconnectBuildingIds.length > 0) {
        await tx.buildingEntrance.createMany({
          data: disconnectBuildingIds.map(disconnectBuildingId => ({
            buildingId: disconnectBuildingId,
            access: entrance.access,
            isMailboxOpen: entrance.isMailboxOpen,
            // biome-ignore lint/style/useNamingConvention: prisma model
            isPMR: entrance.isPMR,
            isOpenEarly: entrance.isOpenEarly,
            buildings: {
              connect: { id: disconnectBuildingId },
            },
            congregationId,
          })),
        })
      }
    })

    logger.info(`Update of entrance ${entranceId} with buildings ${buildingIds.join(', ')} succeed.`)
  } catch (error) {
    logger.error(error)
  }

  // Remove empty entrances.
  await db.buildingEntrance.deleteMany({
    where: { buildings: { none: {} } },
  })
}
