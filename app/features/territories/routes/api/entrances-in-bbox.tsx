import { data } from 'react-router'
import { getPhoneTerritoryActive } from '~/features/settings/index.server'
import { getAvailableEntrancesInBbox, getEntrancesInBbox } from '~/features/territories/server/buildings.server'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/entrances-in-bbox'
import { parseEntrancesInBboxParams } from './entrances-in-bbox-params'

const logger = createLogger('entrances-in-bbox')

export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.TerritoriesManager)

  const url = new URL(request.url)
  const params = parseEntrancesInBboxParams(url.searchParams)
  if (params == null) {
    return data({ error: 'invalid_params' }, { status: 400 })
  }

  const { congregationId } = context.get(currentAccountContext)

  try {
    return await withScopeFromContext(context, async db => {
      const phoneTypeActive = await getPhoneTerritoryActive(db, congregationId)

      if (params.mode === 'edit') {
        const territory = await db.territory.findFirst({
          where: { id: params.territoryId },
          select: { type: true },
        })
        if (territory == null) {
          return data({ error: 'territory_not_found' }, { status: 404 })
        }
        return getEntrancesInBbox(db, congregationId, params.territoryId, territory.type, params.bbox, {
          phoneTypeActive,
        })
      }

      return getAvailableEntrancesInBbox(db, congregationId, params.kind, params.bbox, { phoneTypeActive })
    })
  } catch (error) {
    // Anything reaching here is a genuine server bug (DB down, RLS misconfigured, Prisma crash).
    // Without this catch the framework serves an HTML 500 page, which the client hook then fails
    // to JSON-parse — the user sees a generic "retry" chip forever and ops sees nothing.
    logger.error('entrances-in-bbox loader failed', { err: error, congregationId, mode: params.mode })
    return data({ error: 'internal_error' }, { status: 500 })
  }
}
