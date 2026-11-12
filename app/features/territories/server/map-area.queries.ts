import type { Bbox } from '~/features/territories/model/bbox.type'
import type { CardOverlayPath } from '~/features/territories/model/card-overlay'
import { areaAround } from '~/features/territories/model/map-area'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getPerimeterPaths } from './perimeter.server'

export interface MapArea {
  /** Where the congregation's maps may go, and the tiles the instance serves it. */
  area: Bbox
  /** The perimeter it came from, for a map file cut to its shape; null when it came from the entrances. */
  perimeter: CardOverlayPath[] | null
}

/**
 * The congregation's part of the map: around its perimeter when it drew one, else around its placed entrances.
 * Null while neither exists (no map can show anything yet). Call inside `withScope`.
 */
export async function getMapArea(db: TransactionClient): Promise<MapArea | null> {
  const paths = await getPerimeterPaths(db)
  if (paths != null && paths.length >= 3) {
    const area = areaAround(paths)
    if (area != null) return { area, perimeter: paths }
  }
  const placed = { latitude: { not: null }, longitude: { not: null } }
  const { _min, _max } = await db.buildingEntrance.aggregate({
    where: placed,
    // biome-ignore lint/style/useNamingConvention: Prisma aggregation key
    _min: { latitude: true, longitude: true },
    // biome-ignore lint/style/useNamingConvention: Prisma aggregation key
    _max: { latitude: true, longitude: true },
  })
  if (_min.latitude == null || _min.longitude == null || _max.latitude == null || _max.longitude == null) return null
  const area = areaAround([
    { lat: _min.latitude, lng: _min.longitude },
    { lat: _max.latitude, lng: _max.longitude },
  ])
  return area == null ? null : { area, perimeter: null }
}
