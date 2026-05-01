import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { getAllowedZips } from '~/features/territories/server/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { pointInPolygon } from '~/shared/utils/point-in-polygon.server'

import { fetchOpenData } from './fetch-open-data.server'
import { getTerritoryPolygon } from './get-territory-polygon.server'

export async function importOpenData(
  db: TransactionClient,
  congregationId: number,
  progressCallback: (percent: number) => void = () => {},
) {
  const wantedZips = await getAllowedZips(db)
  const territory = await getTerritoryPolygon(db)
  await db.building.updateMany({
    where: {
      inOpenData: true,
      congregationId,
    },
    data: {
      inOpenData: false,
    },
  })

  const parser = await fetchOpenData(db)

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

        const isActive = territory.length > 0 ? pointInPolygon([Number(lat), Number(long)], territory) : true
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
            entrances: {
              create: {
                kind: EntranceKind.Residential,
                latitude: Number(lat),
                longitude: Number(long),
                congregation: { connect: { id: congregationId } },
              },
            },
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
