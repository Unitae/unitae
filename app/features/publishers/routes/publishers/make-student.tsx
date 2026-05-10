import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { togglePublisherStatus } from '~/features/settings/server/publisher-status.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import type { MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/make-student'

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
      session.flash('error', m.publishers_view_make_student_error({ name }))
    } else {
      const updated = await togglePublisherStatus(db, memberId, currentUser.congregationId, false, currentUser.id)
      if (updated.isPublisher === false) {
        session.flash('success', m.publishers_view_make_student_success({ name }))
      } else {
        session.flash('error', m.publishers_view_make_student_error({ name }))
      }
    }

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? `/publishers/${memberId}/view`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
