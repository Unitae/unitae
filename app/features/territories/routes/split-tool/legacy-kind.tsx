import { redirect } from 'react-router'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { permissionsContext, requirePermission } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/legacy-kind'

// The split tool had a page per type; the type is a choice of the one page now.
const KIND_BY_PATH: Record<string, TerritoryKindKey> = {
  phones: TerritoryKindKey.Phone,
  hotels: TerritoryKindKey.Hotel,
  commerces: TerritoryKindKey.Commerces,
  campus: TerritoryKindKey.Univ,
}

/** Sends a bookmark of an old per-type page to the same type, filters kept. */
export function loader({ request, context }: Route.LoaderArgs) {
  requirePermission(context.get(permissionsContext), Permission.CanPlanTerritorySplits)
  const url = new URL(request.url)
  const kind = KIND_BY_PATH[url.pathname.split('/').filter(Boolean).at(-1) ?? '']
  const params = new URLSearchParams(url.search)
  if (kind) params.set('type', kind)
  return redirect(`/territories/buildings/split-territories?${params.toString()}`)
}
