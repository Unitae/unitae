import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { syncQueue } from '~/features/territories/server/sync-queue.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/sync-buildings'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_sync_meta_title() }]
}

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const currentUser = context.get(currentAccountContext)

  return withScopeFromContext(context, async () => {
    const session = await getSession(request.headers.get('Cookie'))

    await syncQueue.add('sync', {
      userId: currentUser.id,
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
