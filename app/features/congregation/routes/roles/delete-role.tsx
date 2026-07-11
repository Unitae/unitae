import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { deleteRole } from '~/shared/domain/roles.server'
import { ForbiddenError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-role'

export function loader() {
  throw redirect('/congregation/roles')
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.RolesManager)) throw redirect('/congregation/roles')

  const roleId = requireParamId(params.roleId, '/congregation/roles')
  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    try {
      await deleteRole(db, roleId, currentUser.congregationId, currentUser.id)
      session.flash('success', m.congregation_role_delete_success())
    } catch (error) {
      if (error instanceof ForbiddenError) {
        session.flash('error', m.congregation_role_delete_built_in_error())
      } else {
        throw error
      }
    }
    return redirect('/congregation/roles', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
