import { parseWithZod } from '@conform-to/zod/v4'
import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { moveToGroupSchema } from '~/features/publishers/schemas/move-to-group.schema'
import { moveMembersToGroup } from '~/features/publishers/server/group-members.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { formatGroupName } from '~/shared/utils/format-group-name'

import type { Route } from './+types/move-to-group'

export function loader() {
  throw redirect('/publishers')
}

function movedMessage(moved: number, group: { name: string } | null): string {
  const count = String(moved)
  if (group == null) return moved === 1 ? m.publishers_moved_out_one() : m.publishers_moved_out_many({ count })
  const name = formatGroupName(group.name)
  return moved === 1
    ? m.publishers_moved_to_group_one({ group: name })
    : m.publishers_moved_to_group_many({ count, group: name })
}

/** « Changer de groupe » on the publishers list: the same right, and the same rules, as the group page. */
export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanManagePublisherGroups)) {
    throw redirect('/publishers')
  }

  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: moveToGroupSchema })
  const back = async (search = '') =>
    redirect(`/publishers${search}`, { headers: { 'Set-Cookie': await commitSession(session) } })

  if (submission.status !== 'success') {
    session.flash('error', m.publishers_move_error_invalid())
    return back()
  }

  const { memberId, groupId, returnTo } = submission.value
  return withScopeFromContext(context, async (db, congregationId) => {
    try {
      const result = await moveMembersToGroup(db, groupId, congregationId, memberId, currentUser.id)
      if (result.moved > 0) session.flash('success', movedMessage(result.moved, result.group))
      if (result.refused.length > 0) session.flash('error', result.refused.join(' '))
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error
      session.flash('error', m.groups_members_error_not_found())
    }
    return back(returnTo)
  })
}
