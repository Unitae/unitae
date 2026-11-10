import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { data, Form, Link, redirect } from 'react-router'
import { registerSchema } from '~/features/authentication/schemas/login.schema'
import { checkNewPasswordPolicy } from '~/features/authentication/server/password-policy.server'
import { registerCongregation } from '~/features/authentication/server/register-congregation.server'
import {
  commitSession,
  establishAuthenticatedSession,
  getSession,
} from '~/features/authentication/server/session.server'
import { AuthShell } from '~/features/authentication/ui/AuthShell'
import { AUTH_SUBMIT, AuthField, AuthMessage } from '~/features/authentication/ui/auth-parts'
import { LocaleField } from '~/features/authentication/ui/LocaleField'
import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'
import { Input } from '~/shared/ui/input'
import { PasswordInput } from '~/shared/ui/PasswordInput'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { slugify } from '~/shared/utils/slugify'
import { cn } from '~/shared/utils/utils'
import type { Route } from './+types/register'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_register_page_title()} - Unitae` }]
}

// Self-registration exists only in multi-tenant mode. The action needs this check as much as the
// loader: React Router does not run the loader before an action.
function requireMultiTenant() {
  if (process.env.UNITAE_MULTI_TENANT !== 'true') {
    throw redirect('/login')
  }
}

export function loader(_args: Route.LoaderArgs) {
  requireMultiTenant()
  return null
}

export default function RegisterPage({ actionData }: Route.ComponentProps) {
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: registerSchema })
    },
  })

  return (
    <AuthShell congregation={null} title={m.auth_register_page_title()}>
      {form.errors && <AuthMessage tone="error">{form.errors[0]}</AuthMessage>}
      <Form method="post" className="flex flex-col gap-4" {...getFormProps(form)}>
        <AuthField
          id={fields['congregation-name'].id}
          label={m.auth_register_congregation_name_label()}
          errorId={fields['congregation-name'].errorId}
          errors={fields['congregation-name'].errors}
        >
          <Input {...getInputProps(fields['congregation-name'], { type: 'text' })} autoFocus={true} />
        </AuthField>
        <LocaleField
          id={fields.locale.id}
          name={fields.locale.name}
          initialValue={fields.locale.initialValue}
          label={m.auth_register_locale_label()}
          help={m.auth_register_locale_help()}
        />
        <AuthField
          id={fields.email.id}
          label={m.auth_register_admin_email_label()}
          errorId={fields.email.errorId}
          errors={fields.email.errors}
        >
          <Input {...getInputProps(fields.email, { type: 'email' })} autoComplete="email" />
        </AuthField>
        <AuthField
          id={fields.password.id}
          label={m.auth_register_password_label()}
          help={m.auth_password_help()}
          errorId={fields.password.errorId}
          errors={fields.password.errors}
        >
          <PasswordInput {...getInputProps(fields.password, { type: 'password' })} autoComplete="new-password" />
        </AuthField>
        <SubmitButton className={cn('mt-1', AUTH_SUBMIT)}>{m.auth_register_submit()}</SubmitButton>
      </Form>
      <p className="text-faint text-sm">
        {m.auth_register_existing_account()}{' '}
        <Link to="/login" className="text-brand-text underline-offset-4 hover:underline">
          {m.auth_register_login_link()}
        </Link>
      </p>
    </AuthShell>
  )
}

export async function action({ request }: Route.ActionArgs) {
  requireMultiTenant()

  const submission = parseWithZod(await request.formData(), { schema: registerSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const congregationName = submission.value['congregation-name'].trim()
  const locale = submission.value.locale as (typeof locales)[number]
  const email = submission.value.email.trim()
  const password = submission.value.password

  // Brand-new congregation, no policy configured yet: zxcvbn strength only.
  const policyError = await checkNewPasswordPolicy(password, { checkBreached: false })
  if (policyError) {
    return data(submission.reply({ fieldErrors: { password: [policyError] } }), { status: 400 })
  }

  // Every refusal keeps what was typed, and is said under the field it concerns.
  const slug = slugify(congregationName, locale)
  if (slug.length < 2) {
    const fieldErrors = { 'congregation-name': [m.auth_register_slug_invalid_error()] }
    return data(submission.reply({ fieldErrors }), { status: 400 })
  }

  const result = await registerCongregation(congregationName, slug, email, password, locale)

  if ('error' in result) {
    const reply =
      result.error === 'email_taken'
        ? submission.reply({ fieldErrors: { email: [m.auth_register_email_taken_error()] } })
        : submission.reply({ formErrors: [m.auth_register_generic_error()] })
    // Answered as data, like every refusal here: the page keeps the form and says what happened.
    return data(reply, { status: result.error === 'email_taken' ? 409 : 400 })
  }

  const session = await getSession(request.headers.get('Cookie'))

  await establishAuthenticatedSession(session, result.userId)

  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
