import { data } from 'react-router'
import { getTerritoryContent } from '~/features/territories/server/territory-content.queries'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/territory-content'

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.TerritoriesManager)

  const territoryId = requireParamId(params.territoryId, '/territories')

  return withScopeFromContext(context, async db => {
    const content = await getTerritoryContent(db, territoryId)
    if (content == null) {
      return data({ error: 'territory_not_found' }, { status: 404 })
    }
    return content
  })
}
