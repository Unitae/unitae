import { redirect } from 'react-router'

import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { toggleBuildingActive } from '~/features/territories/server/toggle-building-active.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/disable-building'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
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
