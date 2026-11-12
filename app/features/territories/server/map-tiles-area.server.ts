import type { Bbox } from '~/features/territories/model/bbox.type'
import { tilesCovering } from '~/features/territories/model/map-area'
import type { TileStore } from '~/shared/infra/map-tiles.server'
import type { MapArea } from './map-area.queries'

/** A congregation's map area, kept a few minutes: every tile request checks it. */
export function createMapAreaCache({ ttlMs = 5 * 60_000, now = Date.now } = {}) {
  const kept = new Map<number, { at: number; value: MapArea | null }>()
  return {
    async get(congregationId: number, load: () => Promise<MapArea | null>): Promise<MapArea | null> {
      const hit = kept.get(congregationId)
      if (hit != null && now() - hit.at <= ttlMs) return hit.value
      const value = await load()
      kept.set(congregationId, { at: now(), value })
      return value
    },
  }
}

/** The zoom a map of a congregation never needs to go below. */
const WIDEST_ZOOM = 10
const DEFAULT_BUDGET = 150
/** Tiles read at once: enough to keep a remote archive busy, few enough to leave room for people's own maps. */
const IN_FLIGHT = 4

/**
 * Reads the area's tiles into the store before anyone pans to them, wide zooms first, up to the deepest zoom the
 * archive holds and within a budget (a rural congregation's deep zooms are many), a few at a time. Returns how many
 * it read.
 */
export async function warmMapArea(
  store: Pick<TileStore, 'tile' | 'maxZoom'>,
  area: Bbox,
  { budget = DEFAULT_BUDGET } = {},
): Promise<number> {
  const deepest = await store.maxZoom()
  const tiles: [number, number, number][] = []
  for (let z = WIDEST_ZOOM; z <= deepest && tiles.length < budget; z++) {
    for (const [x, y] of tilesCovering(area, z)) {
      if (tiles.length >= budget) break
      tiles.push([z, x, y])
    }
  }
  let next = 0
  const worker = async () => {
    while (next < tiles.length) {
      const [z, x, y] = tiles[next++]
      await store.tile(z, x, y)
    }
  }
  await Promise.all(Array.from({ length: Math.min(IN_FLIGHT, tiles.length) }, worker))
  return tiles.length
}
