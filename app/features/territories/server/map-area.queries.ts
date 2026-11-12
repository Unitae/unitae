import type { Bbox } from '~/features/territories/model/bbox.type'
import type { CardOverlayPath } from '~/features/territories/model/card-overlay'
import { areaAround } from '~/features/territories/model/map-area'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getPerimeterPaths } from './perimeter.server'

export interface MapArea {
  /** Where the congregation's maps may go, and the tiles the instance serves it. */
  area: Bbox
  /**
   * The perimeter, for a map file cut to its shape; null when there is none, or when entrances lie beyond it (the
   * file is then cut to the area's rectangle, so they keep their map).
   */
  perimeter: CardOverlayPath[] | null
}

/**
 * The congregation's part of the map: around its perimeter and its placed entrances together, so that an entrance
 * placed beyond the perimeter can still be reached on a map. Null while neither exists (no map can show anything
 * yet). Call inside `withScope`.
 */
export async function getMapArea(db: TransactionClient): Promise<MapArea | null> {
  const paths = await getPerimeterPaths(db)
  const perimeter = paths != null && paths.length >= 3 ? paths : null
  const placed = { latitude: { not: null }, longitude: { not: null } }
  const { _min, _max } = await db.buildingEntrance.aggregate({
    where: placed,
    // biome-ignore lint/style/useNamingConvention: Prisma aggregation key
    _min: { latitude: true, longitude: true },
    // biome-ignore lint/style/useNamingConvention: Prisma aggregation key
    _max: { latitude: true, longitude: true },
  })
  const corners =
    _min.latitude == null || _min.longitude == null || _max.latitude == null || _max.longitude == null
      ? []
      : [
          { lat: _min.latitude, lng: _min.longitude },
          { lat: _max.latitude, lng: _max.longitude },
        ]
  const area = areaAround([...(perimeter ?? []), ...corners])
  if (area == null) return null
  return { area, perimeter: perimeter != null && corners.every(within(perimeter)) ? perimeter : null }
}

/** Whether a point lies within the rectangle around the shape. */
function within(shape: CardOverlayPath[]) {
  const lats = shape.map(point => point.lat)
  const lngs = shape.map(point => point.lng)
  const [south, north, west, east] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  return (point: CardOverlayPath) => point.lat >= south && point.lat <= north && point.lng >= west && point.lng <= east
}
