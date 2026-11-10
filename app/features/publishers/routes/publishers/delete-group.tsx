import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { deletePublisherGroup } from '~/features/publishers/server/publisher-group-mutations.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-group'

// Deleting is a dialog on the edit page and in the groups list; an old link to this address lands on the edit page.
export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/groups/${params.groupId}/edit`)
}

/** Deletes the group (its publishers stay, in no group) and goes back to the groups list. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManagePublisherGroups)
  const currentUser = context.get(currentAccountContext)
  const groupId = requireParamId(params.groupId, '/groups')

  const group = await withScopeFromContext(context, db =>
    deletePublisherGroup(db, groupId, currentUser.congregationId, currentUser.id),
  )

  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', m.groups_delete_success({ name: formatGroupName(group.name) }))
  return redirect('/groups', { headers: { 'Set-Cookie': await commitSession(session) } })
}
