import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { deleteBuilding } from '~/features/territories/server/delete-building.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-building'

// Deleting is a dialog on the building's pages and in the lists; an old link to this address lands on the building.
export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/territories/building/${params.buildingId}/view`)
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.CanManageBuildings)

  const { congregationId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const building = await deleteBuilding(
      db,
      requireParamId(params.buildingId, '/territories/buildings'),
      congregationId,
    )

    session.flash(
      'success',
      m.prospection_delete_building_flash_success({
        address: `${building.number} ${building.street}, ${building.zip}`,
      }),
    )

    // Back where the reader was, unless that was one of the building's own pages, which are gone with it.
    const previousPage = request.headers.get('referer')
    const own =
      previousPage != null && new URL(previousPage).pathname.startsWith(`/territories/building/${building.id}/`)
    return redirect(previousPage != null && !own ? previousPage : '/territories/buildings', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
