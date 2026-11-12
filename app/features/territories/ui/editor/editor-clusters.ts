import Supercluster from 'supercluster'

// The editor's groups of entrances. Zoomed out, entrances too close to tell apart become one disc with their count;
// from the street level on, where they are added one by one, each shows alone. The values are those of the map's
// former Google clusterer, one zoom level lower and in screen pixels: MapLibre's tiles are 512 pixels, Google's 256.

/** The last zoom with groups: at 15 and closer, every entrance shows alone. */
const MAX_CLUSTER_ZOOM = 14
/** How close, on screen, entrances are grouped. */
const RADIUS = 30

interface Placeable {
  id: number
  latitude: number | null
  longitude: number | null
}

/** What the map draws at a spot: one entrance, or a group of them. */
export type EditorMapItem<T> =
  | { kind: 'entrance'; entrance: T; lat: number; lng: number }
  | { kind: 'cluster'; id: number; count: number; lat: number; lng: number }

export interface ClusterIndex<T> {
  /** What shows in this view (`[west, south, east, north]`) at this zoom. */
  itemsIn: (bounds: [number, number, number, number], zoom: number) => EditorMapItem<T>[]
  /** The zoom at which a group splits. */
  expansionZoom: (clusterId: number) => number
}

/** Indexes the entrances that have a position, once; asking what a view shows is then cheap. */
export function clusterIndex<T extends Placeable>(entrances: readonly T[]): ClusterIndex<T> {
  const index = new Supercluster<{ entrance: T }>({ maxZoom: MAX_CLUSTER_ZOOM, radius: RADIUS })
  index.load(
    entrances.flatMap(entrance =>
      entrance.latitude == null || entrance.longitude == null
        ? []
        : [
            {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [entrance.longitude, entrance.latitude] },
              properties: { entrance },
            },
          ],
    ),
  )

  return {
    itemsIn: (bounds, zoom) =>
      index.getClusters(bounds, Math.round(zoom)).map(feature => {
        const [lng, lat] = feature.geometry.coordinates
        if ('cluster' in feature.properties) {
          return { kind: 'cluster', id: feature.properties.cluster_id, count: feature.properties.point_count, lat, lng }
        }
        return { kind: 'entrance', entrance: feature.properties.entrance, lat, lng }
      }),
    expansionZoom: clusterId => index.getClusterExpansionZoom(clusterId),
  }
}
