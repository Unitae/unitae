import { redirect } from 'react-router'

import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/enable-building'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can } = await authenticateAndAuthorize(request, [Role.TerritoriesManager])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const building = await db.building.update({
    where: { id: requireParamId(params.buildingId, '/territories/buildings') },
    data: { active: true },
  })
  if (building.active === true) {
    session.flash(
      'success',
      `Le batiment au ${building.number} ${building.street}, ${building.zip} a été correctement activé`,
    )
  } else {
    session.flash(
      'error',
      `Le batiment au ${building.number} ${building.street}, ${building.zip} n'a pas pu être activé`,
    )
  }

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/territories/buildings', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
