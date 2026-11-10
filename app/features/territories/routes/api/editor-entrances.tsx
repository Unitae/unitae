import { data } from 'react-router'
import { getPhoneTerritoryActive } from '~/features/settings/index.server'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { searchEditorEntrances } from '~/features/territories/server/territory-editor.queries'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/editor-entrances'

/**
 * The territory editor's search, where no map is shown: `?kind=&territory=&q=`. `&free=1` is the split tool's: only
 * free entrances, for who may split territories (and see them) as well as for who manages them.
 */
export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const params = new URL(request.url).searchParams
  const freeOnly = params.get('free') === '1'
  const splitting =
    freeOnly && permissions.has(Permission.CanPlanTerritorySplits) && permissions.has(Permission.CanViewTerritories)
  if (!splitting) requirePermission(permissions, Permission.CanManageTerritories)

  const kind = Object.values(TerritoryKindKey).find(value => value === params.get('kind'))
  const territory = Number(params.get('territory'))
  if (kind == null) return data({ results: [] }, { status: 400 })

  return withScopeFromContext(context, async (db, congregationId) => {
    const phoneTypeActive = await getPhoneTerritoryActive(db, congregationId)
    const results = await searchEditorEntrances(db, congregationId, {
      kind,
      territoryId: Number.isInteger(territory) && territory > 0 ? territory : null,
      query: params.get('q') ?? '',
      phoneTypeActive,
      freeOnly,
    })
    return { results }
  })
}
