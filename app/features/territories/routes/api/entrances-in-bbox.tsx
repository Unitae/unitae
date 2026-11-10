import { data } from 'react-router'
import { getPhoneTerritoryActive } from '~/features/settings/index.server'
import { getAvailableEntrancesInBbox, getEntrancesInBbox } from '~/features/territories/server/buildings.server'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { AppError } from '~/shared/errors/app-error.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/entrances-in-bbox'
import { parseEntrancesInBboxParams } from './entrances-in-bbox-params'

const logger = createLogger('entrances-in-bbox')

export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const url = new URL(request.url)
  const params = parseEntrancesInBboxParams(url.searchParams)
  // The split tool's map is read by who may split territories (and see them), not only by who manages them.
  const splitting =
    params?.mode === 'create' &&
    permissions.has(Permission.CanPlanTerritorySplits) &&
    permissions.has(Permission.CanViewTerritories)
  if (!splitting) requirePermission(permissions, Permission.CanManageTerritories)

  if (params == null) {
    return data({ error: 'invalid_params' }, { status: 400 })
  }

  const { congregationId } = context.get(currentAccountContext)

  try {
    return await withScopeFromContext(context, async db => {
      const phoneTypeActive = await getPhoneTerritoryActive(db, congregationId)

      if (params.mode === 'edit') {
        const territory = await db.territory.findFirst({
          where: { id: params.territoryId, congregationId },
          select: { type: true },
        })
        if (territory == null) {
          return data({ error: 'territory_not_found' }, { status: 404 })
        }
        return getEntrancesInBbox(db, congregationId, params.territoryId, territory.type, params.bbox, {
          phoneTypeActive,
        })
      }

      if (params.mode === 'new') {
        return getEntrancesInBbox(db, congregationId, null, params.kind, params.bbox, { phoneTypeActive })
      }
      // The split tool: the free entrances, within its filters.
      return getAvailableEntrancesInBbox(
        db,
        congregationId,
        params.kind,
        params.bbox,
        { phoneTypeActive },
        params.filters,
      )
    })
  } catch (error) {
    // Framework redirects (thrown Response) and domain-level AppErrors must bubble to their proper
    // handlers instead of being flattened into a generic 500. Only genuine server bugs (DB down,
    // RLS misconfigured, Prisma crash) should hit the JSON error branch below — otherwise the
    // client hook shows a retry chip forever and ops sees nothing.
    if (error instanceof Response) throw error
    if (error instanceof AppError) throw error
    logger.error('entrances-in-bbox loader failed', { err: error, congregationId, mode: params.mode })
    return data({ error: 'internal_error' }, { status: 500 })
  }
}
