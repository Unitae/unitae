import { Form, redirect } from 'react-router'

import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/delete-building'

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageProspection = await verifyRole(request, Role.ProspectionManager)

  if (!canManageProspection) {
    throw redirect('/')
  }

  const building = await db.building.findUnique({
    where: { id: requireParamId(params.buildingId, '/territories/buildings') },
  })

  if (building == null) {
    throw redirect('/territories/attributions')
  }

  return { building }
}

export default function DeleteBuilding({ loaderData }: Route.ComponentProps) {
  const { building } = loaderData

  return (
    <div className="flex flex-col items-center justify-center gap-7 p-7">
      <p className="text-center">
        Êtes-vous sûr de vouloir supprimer le batiment au {building.number} {building.street}, {building.zip} ? Cette
        action est irréversible.
      </p>
      <Form method="post">
        <button
          type="submit"
          title="Supprimer le batiment définitivement"
          className={'rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-900 max-sm:p-2'}
        >
          Supprimer ce batiment
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session } = await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const building = await db.building.delete({
    where: { id: requireParamId(params.buildingId, '/territories/buildings') },
  })

  session.flash(
    'success',
    `Le batiment au ${building.number} ${building.street}, ${building.zip} a été correctement supprimé`,
  )

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/territories/buildings', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
