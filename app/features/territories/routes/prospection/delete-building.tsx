import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteBuilding } from '~/features/territories/server/delete-building.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-building'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer un immeuble — Unitae' }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.ProspectionManager)) {
    throw redirect('/')
  }

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const building = await db.building.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
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

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  const { congregationId } = context.get(userContext)

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
