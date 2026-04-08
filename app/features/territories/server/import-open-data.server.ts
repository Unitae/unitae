import { getAllowedZips } from '~/features/territories/server/settings'
import { db } from '~/shared/libs/db.server'
import { pointInPolygon } from '~/shared/libs/point-in-polygon.server'

import { fetchOpenData } from './fetch-open-data.server'
import { getTerritoryPolygon } from './get-territory-polygon.server'

export async function importOpenData(congregationId: number, progressCallback: (percent: number) => void = () => {}) {
  const wantedZips = await getAllowedZips()
  const territory = await getTerritoryPolygon()
  await db.building.updateMany({
    where: {
      inOpenData: true,
    },
    data: {
      inOpenData: false,
    },
  })

  const parser = await fetchOpenData()

  return new Promise<void>((resolve, reject) => {
    let totalItems = 0
    let processedItems = 0

    parser.on('start', total => {
      totalItems = total
    })

    parser.on('error', error => {
      reject(error)
    })

    parser.on('data', async ([, number, street, zip, , , lat, long]) => {
      processedItems++

      parser.pause()
      try {
        if (!wantedZips.includes(zip)) {
          parser.resume()
          return
        }

        const isActive = pointInPolygon([Number(lat), Number(long)], territory)
        await db.building.upsert({
          where: {
            address: {
              number,
              street,
              zip,
              congregationId,
            },
          },
          create: {
            number,
            street,
            zip,
            latitude: Number(lat),
            longitude: Number(long),
            inOpenData: true,
            active: isActive,
            inTerritory: isActive,
            entrance: { create: { congregation: { connect: { id: congregationId } } } },
            congregation: { connect: { id: congregationId } },
          },
          update: {
            inTerritory: isActive,
            inOpenData: true,
          },
        })
      } finally {
        parser.resume()
      }

      const percent = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0
      if (percent % 10 === 0) {
        progressCallback(percent)
      }
    })

    parser.on('end', () => resolve())
  })
}
