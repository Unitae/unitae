import { parseWithZod } from '@conform-to/zod/v4'
import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { groupMemberSchema } from '~/features/publishers/schemas/group.schema'
import { addGroupMember } from '~/features/publishers/server/group-members.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/group-member-add'

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
  const session = await getSession(request.headers.get('Cookie'))
  const backToEdit = async () =>
    redirect(`/groups/${groupId}/edit`, { headers: { 'Set-Cookie': await commitSession(session) } })

  const submission = parseWithZod(await request.formData(), { schema: groupMemberSchema })
  if (submission.status !== 'success') {
    session.flash('error', m.groups_members_error_none_chosen())
    return backToEdit()
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    try {
      const member = await addGroupMember(db, groupId, congregationId, submission.value.memberId, currentUser.id)
      session.flash('success', m.groups_members_added({ name: formatPersonName(member) }))
    } catch (error) {
      // The leader of another group (the message says which) or a member who cannot be in one.
      if (error instanceof ConflictError) session.flash('error', error.message)
      else if (error instanceof NotFoundError) session.flash('error', m.groups_members_error_not_found())
      else throw error
    }
    return backToEdit()
  })
}
