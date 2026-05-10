import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { unlinkAccountFromMember } from '~/features/publishers/server/unlink-account-from-member.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/unlink-login'

export function loader() {
  throw redirect('/publishers')
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.PublisherManager)) {
    throw redirect('/')
  }

  const memberId = requireParamId(params.publisherId, '/publishers')
  const session = await getSession(request.headers.get('Cookie'))

  const result = await withScopeFromContext(context, async db => {
    try {
      const member = await db.member.findFirst({
        where: { id: memberId, congregationId: currentUser.congregationId },
        select: { account: { select: { email: true } } },
      })
      const removed = await unlinkAccountFromMember(db, memberId, currentUser.congregationId, currentUser.id)
      return { removed, email: member?.account?.email ?? '' }
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw redirect('/publishers')
      }
      throw error
    }
  })

  if (result.removed != null) {
    session.flash('success', m.publishers_edit_unlink_login_success({ email: result.email }))
  }

  return redirect(`/publishers/${memberId}/edit`, {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
