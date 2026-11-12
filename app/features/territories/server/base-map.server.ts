import type { BaseMap } from '~/features/territories/model/base-map.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { getMapTiles } from '~/shared/infra/map-tiles.server'
import { getMapArea } from './map-area.queries'
import { warmMapArea } from './map-tiles-area.server'

/** Congregations whose area was warmed, with the archive's edition: once per edition is enough. */
const warmed = new Set<string>()

/**
 * What a territory map needs (a holder's, the editor's), or null when there can be none: no archive on the instance,
 * no area yet, or an archive that cannot be read — the page then goes without its map rather than fail. The first ask
 * for a congregation (per edition of the archive) also starts reading its area's tiles into memory, so its maps open
 * from there.
 */
export async function getBaseMap(db: TransactionClient, congregationId: number): Promise<BaseMap | null> {
  const store = getMapTiles()
  if (store == null) return null
  const mapArea = await getMapArea(db)
  if (mapArea == null) return null
  try {
    const edition = await store.edition()
    const key = `${congregationId}:${edition}`
    if (!warmed.has(key)) {
      warmed.add(key)
      warmMapArea(store, mapArea.area).catch(error => {
        warmed.delete(key)
        logger.warn('Map tiles: warming the area failed', {
          tag: 'map-tiles',
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }
    return { tiles: `/map/tiles/${edition}/{z}/{x}/{y}`, area: mapArea.area }
  } catch (error) {
    logger.warn('Map tiles: the archive could not be read, the map is left out', {
      tag: 'map-tiles',
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
