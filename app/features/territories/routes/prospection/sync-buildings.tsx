import { redirect } from 'react-router'

import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { syncQueue } from '~/features/territories/server/sync-queue.server'
import { db, restoreCongregationContext } from '~/shared/libs/db.server'

import type { Route } from './+types/sync-buildings'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Batiment - Unitae' }]
}

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request }: Route.ActionArgs) {
  const { session, currentUser } = await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  restoreCongregationContext(currentUser.congregationId)
  const user = await db.user.findUnique({
    where: {
      id: Number(session.get('userId')) ?? 0,
    },
  })

  if (user == null) {
    throw redirect('/')
  }

  await syncQueue.add('sync', {
    userName: user.firstname ?? undefined,
    userEmail: user.email,
    congregationId: currentUser.congregationId,
  })

  session.flash(
    'success',
    `Les données sont en cours d'importation. Nous vous enverrons un email une fois l'opération terminée.`,
  )

  return redirect('/territories/buildings', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
