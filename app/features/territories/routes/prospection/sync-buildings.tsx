import { redirect } from 'react-router'

import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { syncQueue } from '~/features/territories/server/sync-queue.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'

import type { Route } from './+types/sync-buildings'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Batiment - Unitae' }]
}

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request }: Route.ActionArgs) {
  const { session, currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.TerritoriesManager,
  ])
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canManageTerritories) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const user = await db.user.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: Number(session.get('userId')) ?? 0, congregationId },
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
  })
}
