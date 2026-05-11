import { parseWithZod } from '@conform-to/zod'
import { data, redirect } from 'react-router'
import { z } from 'zod'
import ResetPasswordRequired from '~/features/authentication/emails/reset-password-required'
import { sendResetAccountPasswordEmail } from '~/features/authentication/server/send-reset-account-password-email.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { linkAccountToMember } from '~/features/publishers/server/link-account-to-member.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { resolveCongregation } from '~/shared/domain/congregation.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/link-login'

const linkLoginSchema = z.object({
  email: z.string().email(),
})

export function loader() {
  throw redirect('/publishers')
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.PublisherManager)) {
    throw redirect('/')
  }

  const memberId = requireParamId<MemberId>(params.publisherId, '/publishers')
  const submission = parseWithZod(await request.formData(), { schema: linkLoginSchema })
  const session = await getSession(request.headers.get('Cookie'))
  const redirectTo = `/publishers/${memberId}/edit`

  if (submission.status !== 'success') {
    session.flash('error', m.publishers_edit_link_login_error_invalid())
    return redirect(redirectTo, { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  const result = await withScopeFromContext(context, async db => {
    try {
      return await linkAccountToMember(db, {
        memberId,
        email: submission.value.email,
        congregationId: currentUser.congregationId,
        actorId: currentUser.id,
      })
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw redirect('/publishers')
      }
      if (error instanceof ConflictError) {
        return { error: 'conflict' as const }
      }
      throw error
    }
  })

  if ('error' in result) {
    session.flash('error', m.publishers_edit_link_login_error_conflict())
    return data(submission.reply({ formErrors: ['email_conflict'] }), {
      status: 409,
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const congregation = await resolveCongregation(currentUser.congregationId)
  await sendResetAccountPasswordEmail(
    result.accountId,
    <ResetPasswordRequired
      email={submission.value.email}
      token={result.resetToken}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />,
  )

  session.flash('success', m.publishers_edit_link_login_success({ email: submission.value.email }))
  return redirect(redirectTo, { headers: { 'Set-Cookie': await commitSession(session) } })
}
