import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect } from 'react-router'
import { createUserSchema } from '~/features/settings/schemas/user.schema'
import { createAccount, UserAlreadyExistsError } from '~/features/settings/server/create-account.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitReachedError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { redirectWithToast } from '../_toast.server'
import type { Route } from './+types/new-user'

// The account is created from the users list's dialog; the address of the old page leads there.
export function loader() {
  throw redirect('/settings/users')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageUsers)
  const currentUser = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)
  const submission = parseWithZod(await request.formData(), { schema: createUserSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

  const { firstname, lastname, email } = submission.value
  // Outside the transaction: a refused address rolls it back before the answer goes out.
  let result: Awaited<ReturnType<typeof createAccount>>
  try {
    result = await withScopeFromContext(context, async db => {
      const { ResetPasswordRequired } = await import('~/features/authentication')
      return createAccount(
        db,
        congregation,
        currentUser.id,
        { firstname, lastname, email, congregationId: currentUser.congregationId },
        (_userId, token) => (
          <ResetPasswordRequired
            email={email}
            firstname={firstname || undefined}
            token={token}
            baseUrl={congregation.baseUrl}
            platformName={congregation.displayName}
          />
        ),
      )
    })
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) {
      return data(submission.reply({ fieldErrors: { email: [m.settings_users_email_taken()] } }), { status: 409 })
    }
    if (error instanceof LimitReachedError) {
      return data(submission.reply({ formErrors: [m.settings_users_limit()] }), { status: 409 })
    }
    throw error
  }

  return redirectWithToast(
    request,
    `/settings/users/${result.userId}`,
    result.emailSent ? m.settings_users_new_created({ email }) : m.auth_email_send_warning_user_created(),
    result.emailSent ? 'success' : 'error',
  )
}
