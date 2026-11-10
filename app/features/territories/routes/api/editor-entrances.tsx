import { data } from 'react-router'
import { getPhoneTerritoryActive } from '~/features/settings/index.server'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { searchEditorEntrances } from '~/features/territories/server/territory-editor.queries'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/editor-entrances'

/** The territory editor's search, where no map is shown: `?kind=&territory=&q=`. */
export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritories)

  const params = new URL(request.url).searchParams
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
    })
    return { results }
  })
}
