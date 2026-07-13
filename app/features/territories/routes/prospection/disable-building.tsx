import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { toggleBuildingActive } from '~/features/territories/server/toggle-building-active.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/disable-building'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const { congregationId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const building = await toggleBuildingActive(
      db,
      requireParamId(params.buildingId, '/territories/buildings'),
      congregationId,
      false,
    )

    if (building.active === false) {
      session.flash(
        'success',
        m.prospection_disable_building_success({ address: `${building.number} ${building.street}, ${building.zip}` }),
      )
    } else {
      session.flash(
        'error',
        m.prospection_disable_building_error({ address: `${building.number} ${building.street}, ${building.zip}` }),
      )
    }

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/territories/buildings', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
