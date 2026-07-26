import { data } from 'react-router'
import { getTerritoryContent } from '~/features/territories/server/territory-content.queries'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/territory-content'

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.TerritoriesManager)

  // JSON API — reject invalid ids with a 400 body the client can parse,
  // rather than redirecting to an HTML page that would break `response.json()`.
  const territoryId = Number(params.territoryId)
  if (!Number.isInteger(territoryId) || territoryId <= 0) {
    return data({ error: 'invalid_id' }, { status: 400 })
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const content = await getTerritoryContent(db, territoryId, congregationId)
    if (content == null) {
      return data({ error: 'territory_not_found' }, { status: 404 })
    }
    return content
  })
}
