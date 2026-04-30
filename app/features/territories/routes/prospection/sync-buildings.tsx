import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { syncQueue } from '~/features/territories/server/sync-queue.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, requireRole, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/sync-buildings'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_sync_meta_title() }]
}

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requireRole(permissions, Role.TerritoriesManager)

  const currentUser = context.get(userContext)
  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const rawUserId = session.get('userId')
    const sessionUserId = Number(rawUserId)
    if (!rawUserId || Number.isNaN(sessionUserId) || sessionUserId <= 0) {
      throw redirect('/')
    }

    const user = await db.user.findUnique({
      where: {
        id_congregationId: { id: sessionUserId, congregationId },
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

    session.flash('success', m.prospection_sync_flash_success())

    return redirect('/territories/buildings', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
