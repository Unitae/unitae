import { redirect } from 'react-router'
import { permissionsContext, requirePermission } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/legacy-list'

// The lists used to be pages of their own; they are views of /territories/buildings now.
const VIEW_BY_PATH: Record<string, string> = {
  new: 'new',
  'need-check': 'check',
  missing: 'missing',
  all: 'all',
}

/** Sends a bookmark of an old list page to the same view, filters kept. */
export function loader({ request, context }: Route.LoaderArgs) {
  requirePermission(context.get(permissionsContext), Permission.CanViewProspection)
  const url = new URL(request.url)
  const view = VIEW_BY_PATH[url.pathname.split('/').filter(Boolean).at(-1) ?? '']
  const params = new URLSearchParams(url.search)
  params.delete('page')
  if (view) params.set('view', view)
  const query = params.toString()
  return redirect(`/territories/buildings${query ? `?${query}` : ''}`)
}
