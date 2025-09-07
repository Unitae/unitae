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

  const attribution = await db.attribution.findUnique({
    where: { id: requireParamId(params.attributionId, '/territories/attributions') },
    include: { publisher: true, territory: true },
  })

  if (attribution == null) {
    throw redirect('/territories/attributions')
  }

  return { attribution }
}

export default function DeleteGroup({ loaderData }: Route.ComponentProps) {
  const { attribution } = loaderData

  return (
    <div className="flex flex-col items-center justify-center gap-7 p-7">
      <p className="text-center">
        Êtes-vous sûr de vouloir annuler l'attribution de {attribution.publisher.firstname} ? Cette action est
        irréversible.
      </p>
      <Form method="post">
        <button
          type="submit"
          title="Annuler l'attribution du territoire"
          className={'rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-900 max-sm:p-2'}
        >
          Annuler l'attribution du territoire {attribution.territory.number}
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

  const attribution = await db.attribution.delete({
    where: { id: requireParamId(params.attributionId, '/territories/attributions') },
    include: { publisher: true },
  })

  session.flash(
    'success',
    `L'attribution de ${attribution.publisher.lastname?.toLocaleUpperCase()} ${attribution.publisher.firstname} a été annulée`,
  )

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/territories/attributions', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
