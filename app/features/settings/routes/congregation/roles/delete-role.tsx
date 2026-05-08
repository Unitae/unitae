import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteRole } from '~/features/settings/server/roles.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { ForbiddenError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-role'

export function loader() {
  throw redirect('/settings/congregation/roles')
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  if (!permissions.has(Permission.RolesManager)) throw redirect('/settings/congregation/roles')

  const roleId = requireParamId(params.roleId, '/settings/congregation/roles')
  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    try {
      await deleteRole(db, roleId, currentUser.congregationId, currentUser.id)
      session.flash('success', m.settings_role_delete_success())
    } catch (error) {
      if (error instanceof ForbiddenError) {
        session.flash('error', m.settings_role_delete_built_in_error())
      } else {
        throw error
      }
    }
    return redirect('/settings/congregation/roles', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
