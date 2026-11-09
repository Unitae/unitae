import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { deleteTerritory } from '~/features/territories/server/delete-territory.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

// « Supprimer » is a dialog of the territories list and of the territory's page: the old confirmation page leads back
// to the territory.
export function loader({ params }: Route.LoaderArgs) {
  const id = requireParamId(params.territoryId, '/territories')
  throw redirect(`/territories/territory/${id}/view`)
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritories)
  const { id: actorId } = context.get(currentAccountContext)
  const id = requireParamId(params.territoryId, '/territories')

  return withScopeFromContext(context, async (db, congregationId) => {
    try {
      const territory = await deleteTerritory(db, id, congregationId, actorId)
      const session = await getSession(request.headers.get('Cookie'))
      session.flash('success', m.territories_delete_flash_success({ number: territory.number }))
      // Data, not a redirect: the dialog closes on it. The list loses the row when it revalidates; the territory's
      // own page, revalidated, finds nothing and goes back to the list.
      return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
    } catch (error) {
      // Attributed once: its history counts for the S-13, so it stays.
      if (error instanceof ConflictError) return data({ error: m.territories_delete_has_history() }, { status: 409 })
      throw error
    }
  })
}
