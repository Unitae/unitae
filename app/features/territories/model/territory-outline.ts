export interface MapPoint {
  lat: number
  lng: number
}

const cross = (o: MapPoint, a: MapPoint, b: MapPoint) =>
  (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng)

/**
 * The outline the editor draws around a territory: the convex hull of its entrances (Andrew's monotone chain).
 * Nothing to draw under three distinct points.
 */
export function territoryOutline(points: readonly MapPoint[]): MapPoint[] {
  const sorted = [...new Map(points.map(point => [`${point.lat},${point.lng}`, point])).values()].sort(
    (a, b) => a.lng - b.lng || a.lat - b.lat,
  )
  if (sorted.length < 3) return []

  const half = (list: MapPoint[]) => {
    const hull: MapPoint[] = []
    for (const point of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop()
      hull.push(point)
    }
    hull.pop()
    return hull
  }
  const outline = [...half(sorted), ...half([...sorted].reverse())]
  return outline.length >= 3 ? outline : []
}
