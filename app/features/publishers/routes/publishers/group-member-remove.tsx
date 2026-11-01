import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { removeGroupMember } from '~/features/publishers/server/group-members.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/group-member-remove'

export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/groups/${params.groupId}/edit`)
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanManagePublisherGroups)) {
    throw redirect('/')
  }

  const currentUser = context.get(currentAccountContext)
  const groupId = requireParamId(params.groupId, '/groups')
  const memberId = requireParamId(params.memberId, `/groups/${groupId}/edit`)
  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async (db, congregationId) => {
    try {
      const member = await removeGroupMember(db, groupId, congregationId, memberId, currentUser.id)
      session.flash('success', m.groups_members_removed({ name: formatPersonName(member) }))
    } catch (error) {
      // The group's own overseer or deputy (the message says what to do), or someone not in it.
      if (error instanceof ConflictError) session.flash('error', error.message)
      else if (error instanceof NotFoundError) session.flash('error', m.groups_members_error_not_found())
      else throw error
    }
    return redirect(`/groups/${groupId}/edit`, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
