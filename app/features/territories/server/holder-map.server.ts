import type { Bbox } from '~/features/territories/model/bbox.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { getMapTiles } from '~/shared/infra/map-tiles.server'
import { getMapArea } from './map-area.queries'
import { warmMapArea } from './map-tiles-area.server'

export interface HolderMap {
  /** The tile address template, with the archive's edition in it so the browser may keep the tiles. */
  tiles: string
  /** The congregation's area: the map stays within it, and only its tiles are served. */
  area: Bbox
}

/** Congregations whose area was warmed, with the archive's edition: once per edition is enough. */
const warmed = new Set<string>()

/**
 * What a territory page needs to draw its map, or null when it has none (no archive on the instance, no area yet,
 * or an archive that cannot be read — the page then shows its list alone rather than fail). The first ask for a
 * congregation (per edition of the archive) also starts reading its area's tiles into memory, so its maps open from
 * there.
 */
export async function getHolderMap(db: TransactionClient, congregationId: number): Promise<HolderMap | null> {
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
