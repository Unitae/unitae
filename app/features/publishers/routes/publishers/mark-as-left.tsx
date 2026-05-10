import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { setMemberLeft } from '~/features/publishers/server/set-member-left.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/mark-as-left'

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.PublisherManager)) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const memberId = requireParamId<MemberId>(params.publisherId, '/publishers')

    const member = await db.member.findFirst({
      where: { id: memberId, congregationId: currentUser.congregationId },
      select: { firstname: true, lastname: true },
    })
    const name = member ? `${member.firstname} ${member.lastname}` : ''

    if (!member) {
      session.flash('error', m.publishers_view_mark_as_left_error({ name }))
    } else {
      try {
        await setMemberLeft(db, memberId, currentUser.congregationId, currentUser.id)
        session.flash('success', m.publishers_view_mark_as_left_success({ name }))
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error
        session.flash('error', m.publishers_view_mark_as_left_error({ name }))
      }
    }

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? `/publishers/${memberId}/view`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
