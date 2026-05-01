import { data } from 'react-router'
import { getEntrancesInBbox } from '~/features/territories/server/buildings.server'
import { permissionsContext, requireRole, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/entrances-in-bbox'

function parseBbox(value: string | null): { swLat: number; swLng: number; neLat: number; neLng: number } | null {
  if (!value) return null
  const parts = value.split(',').map(Number)
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return null
  const [swLat, swLng, neLat, neLng] = parts
  return { swLat, swLng, neLat, neLng }
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requireRole(permissions, Role.TerritoriesManager)

  const url = new URL(request.url)
  const bbox = parseBbox(url.searchParams.get('bbox'))
  const territoryId = Number(url.searchParams.get('territoryId'))

  if (bbox == null || !Number.isInteger(territoryId) || territoryId <= 0) {
    return data({ error: 'invalid_params' }, { status: 400 })
  }

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const territory = await db.territory.findFirst({ where: { id: territoryId }, select: { type: true } })
    if (territory == null) {
      return data({ error: 'territory_not_found' }, { status: 404 })
    }
    return getEntrancesInBbox(db, congregationId, territoryId, territory.type, bbox)
  })
}
