import { Form, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  const territory = await db.territory.findUnique({ where: { id: requireParamId(params.territoryId, '/territories') } })

  if (territory == null) {
    throw redirect('/territories')
  }

  return { territory }
}

export default function DeleteTerritory({ loaderData }: Route.ComponentProps) {
  const { territory } = loaderData

  return (
    <div className="flex flex-col items-center justify-center gap-7 p-7">
      <p className="text-center">
        Êtes-vous sûr de vouloir supprimer le territoire nº{territory.number} ? Cette action est irréversible.
      </p>
      <Form method="post">
        <button
          type="submit"
          title="Supprimer le batiment définitivement"
          className={'rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-900 max-sm:p-2'}
        >
          Supprimer le territoire nº{territory.number}
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

  const territory = await db.territory.delete({ where: { id: requireParamId(params.territoryId, '/territories') } })

  session.flash('success', `Le territoire nº${territory.number} a été correctement supprimé`)

  return redirect('/territories', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
