import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication'
import { deleteBuilding } from '~/features/territories/server/delete-building.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-building'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer un immeuble — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.ProspectionManager)

  const { congregationId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const building = await db.building.findUnique({
      where: {
        id_congregationId: { id: requireParamId(params.buildingId, '/territories/buildings'), congregationId },
      },
    })

    if (building == null) {
      throw redirect('/territories/attributions')
    }

    return { building }
  })
}

export default function DeleteBuilding({ loaderData }: Route.ComponentProps) {
  const { building } = loaderData

  return (
    <DeleteConfirmation
      title={m.prospection_delete_building_title()}
      submitLabel={m.prospection_delete_building_submit()}
      cancelTo="/territories/buildings"
    >
      <p>
        {building.number} {building.street}, {building.zip}
      </p>
    </DeleteConfirmation>
  )
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

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

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/territories/buildings', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
