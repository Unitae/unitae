import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import * as m from '~/i18n/paraglide/messages'
import { LastAdminError } from '~/shared/auth/permissions.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { GrantBeyondActorError } from '~/shared/domain/role-grant-limits.server'
import { deleteRole } from '~/shared/domain/roles.server'
import { AppError, ForbiddenError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-role'

export function loader() {
  throw redirect('/congregation/roles')
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.CanManageRoles)) throw redirect('/congregation/roles')

  const roleId = requireParamId(params.roleId, '/congregation/roles')
  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    try {
      await deleteRole(db, roleId, currentUser.congregationId, currentUser.id, permissions)
      session.flash('success', m.congregation_role_delete_success())
    } catch (error) {
      // Two different refusals reach here, and both are things the admin can act on: a built-in
      // role, and a role that organigram services still report to. Catching only the first left
      // the second escaping as a 500 — `deleteRole` phrases it well, so pass it through.
      if (error instanceof LastAdminError) {
        session.flash('error', m.settings_user_last_admin())
      } else if (error instanceof GrantBeyondActorError) {
        session.flash('error', m.error_forbidden())
      } else if (error instanceof ForbiddenError) {
        session.flash('error', m.congregation_role_delete_built_in_error())
      } else if (error instanceof AppError) {
        session.flash('error', error.message)
      } else {
        // Not a refusal — a dropped connection is not something an admin can act on, and
        // reporting it as "cannot be deleted" would be a lie.
        throw error
      }
    }
    return redirect('/congregation/roles', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
