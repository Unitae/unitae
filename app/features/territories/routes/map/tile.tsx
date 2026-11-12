import { bboxesOverlap, reachAround, tileBbox } from '~/features/territories/model/map-area'
import { getMapArea } from '~/features/territories/server/map-area.queries'
import { createMapAreaCache } from '~/features/territories/server/map-tiles-area.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { getMapTiles } from '~/shared/infra/map-tiles.server'
import { Permission } from '~/shared/types/permission'
import type { Route } from './+types/tile'

// One base-map tile. The browser never reaches the archive: the instance serves its tiles itself, only to signed-in
// accounts (the authenticated layout's middleware) and only inside their congregation's area, so the archive is not
// a free map for anyone who finds its address. Whoever draws the congregation's map (Réglages › Carte de l'assemblée)
// reaches about ten kilometres further, so its perimeter can grow. The edition in the address lets the browser keep a
// tile for good.

const areas = createMapAreaCache()
const KEEP = 'private, max-age=31536000, immutable'
const INTEGER = /^\d{1,8}$/
const MAX_ZOOM = 24

const empty = (status: number, cacheControl?: string) =>
  new Response(null, { status, headers: cacheControl == null ? undefined : { 'Cache-Control': cacheControl } })

function coordinates(params: Route.LoaderArgs['params']): [number, number, number] | null {
  if (![params.z, params.x, params.y].every(value => INTEGER.test(value))) return null
  const [z, x, y] = [params.z, params.x, params.y].map(Number)
  if (z > MAX_ZOOM || x >= 2 ** z || y >= 2 ** z) return null
  return [z, x, y]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const store = getMapTiles()
  if (store == null) return empty(404)
  const tile = coordinates(params)
  if (tile == null) return empty(400)
  const [z, x, y] = tile

  try {
    if (params.edition !== (await store.edition())) return empty(404)
    // Maps never ask past the deepest zoom the archive holds (they enlarge its tiles): nothing to read there.
    if (z > (await store.maxZoom())) return empty(204, KEEP)
    const { congregationId } = context.get(currentAccountContext)
    const mapArea = await areas.get(congregationId, () => withScopeFromContext(context, db => getMapArea(db)))
    const drawing = context.get(permissionsContext).has(Permission.CanConfigureTerritorySettings)
    const bounds = mapArea == null ? null : drawing ? reachAround(mapArea.area) : mapArea.area
    // Outside the area: nothing to draw. A short cache, so a newly drawn perimeter shows within minutes.
    if (bounds == null || !bboxesOverlap(bounds, tileBbox(z, x, y))) return empty(204, 'private, max-age=300')

    const found = await store.tile(z, x, y)
    if (found == null) return empty(204, KEEP)
    return new Response(found.data, {
      headers: {
        'Content-Type': 'application/vnd.mapbox-vector-tile',
        'Content-Encoding': found.encoding,
        'Cache-Control': KEEP,
      },
    })
  } catch (error) {
    logger.warn('Map tiles: the archive could not be read', {
      tag: 'map-tiles',
      error: error instanceof Error ? error.message : String(error),
    })
    return empty(503)
  }
}
