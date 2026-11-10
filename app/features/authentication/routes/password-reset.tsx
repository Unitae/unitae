import { getFormProps, getInputProps, type SubmissionResult, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { Clock } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { resetPasswordSchema } from '~/features/authentication/schemas/login.schema'
import { isAccountInBreachScope } from '~/features/authentication/server/breach-scope.server'
import { verifyPasswordResetToken } from '~/features/authentication/server/invalidate-account-password.server'
import { checkNewPasswordPolicy } from '~/features/authentication/server/password-policy.server'
import { resetAccountPassword } from '~/features/authentication/server/reset-account-password.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'
import { getCongregationBrand, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { withScope } from '~/shared/infra/db.server'
import { AuthShell } from '~/shared/ui/AuthShell'
import { AUTH_SUBMIT, AuthField, AuthLink } from '~/shared/ui/auth-parts'
import { Button } from '~/shared/ui/button'
import { PasswordInput } from '~/shared/ui/PasswordInput'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import type { Route } from './+types/password-reset'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_password_reset_page_title()} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await resolveCongregationFromRequest(request)

  const congregation = await getCongregationBrand(request)
  const user = await verifyPasswordResetToken(params.userHash ?? '')

  // A used or expired link says so, and offers a new one, rather than landing on the sign-in page without a word.
  if (user == null) return { valid: false as const, congregation }
  return { valid: true as const, email: user.email, congregation }
}

export default function PasswordResetPage({ loaderData, actionData }: Route.ComponentProps) {
  // The link can also run out between opening the page and saving: the action then refuses, and says the same.
  const refused = actionData != null && 'invalid' in actionData

  if (!loaderData.valid || refused) {
    return (
      <AuthShell
        congregation={loaderData.congregation}
        icon={Clock}
        title={m.auth_link_expired_title()}
        description={m.auth_password_reset_expired_body()}
      >
        <Button asChild className={AUTH_SUBMIT}>
          <Link to="/password/forgot">{m.auth_password_reset_new_link()}</Link>
        </Button>
        <AuthLink to="/login">{m.auth_back_to_login()}</AuthLink>
      </AuthShell>
    )
  }

  return (
    <AuthShell congregation={loaderData.congregation} title={m.auth_password_reset_page_title()}>
      <NewPasswordForm email={loaderData.email} result={actionData} />
    </AuthShell>
  )
}

/** The account, said rather than shown as a greyed field, and the new password typed twice. */
function NewPasswordForm({ email, result }: { email: string; result: SubmissionResult<string[]> | undefined }) {
  const [form, fields] = useForm({
    lastResult: result,
    defaultValue: { email },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: resetPasswordSchema })
    },
  })

  return (
    <Form method="post" className="flex flex-col gap-4" {...getFormProps(form)}>
      <input type="hidden" name="email" value={email} />
      <p className="flex flex-col gap-0.5 rounded-md bg-sidebar px-3 py-2.5 text-sm">
        <span className="text-faint text-xs">{m.auth_password_reset_account()}</span>
        {email}
      </p>
      <AuthField
        id={fields.password.id}
        label={m.auth_password_reset_new_password_label()}
        help={m.auth_password_help()}
        errorId={fields.password.errorId}
        errors={fields.password.errors}
      >
        <PasswordInput {...getInputProps(fields.password, { type: 'password' })} autoComplete="new-password" />
      </AuthField>
      <AuthField
        id={fields.passwordConfirm.id}
        label={m.auth_password_reset_confirm_password_label()}
        errorId={fields.passwordConfirm.errorId}
        errors={fields.passwordConfirm.errors}
      >
        <PasswordInput {...getInputProps(fields.passwordConfirm, { type: 'password' })} autoComplete="new-password" />
      </AuthField>
      <SubmitButton className={AUTH_SUBMIT}>{m.auth_password_reset_submit()}</SubmitButton>
    </Form>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: resetPasswordSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { email: username, password } = submission.value

  const user = await verifyPasswordResetToken(params.userHash ?? '')

  if (user == null || user.email !== username) {
    return data({ invalid: true as const }, { status: 410 })
  }

  const checkBreached = await withScope(user.congregationId, db =>
    isAccountInBreachScope(db, user.id, user.congregationId),
  )
  const policyError = await checkNewPasswordPolicy(password, { checkBreached })
  if (policyError) {
    return data(submission.reply({ fieldErrors: { password: [policyError] } }), { status: 400 })
  }

  // Also ends every pending reset link of the account, in the same transaction.
  await resetAccountPassword(user.id, password)

  session.flash('success', m.auth_password_reset_success_message())
  return redirect('/login', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
