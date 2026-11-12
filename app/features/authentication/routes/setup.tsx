import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { data, Form, redirect } from 'react-router'
import { setupSchema } from '~/features/authentication/schemas/login.schema'

import { needSetupProcess } from '~/features/authentication/server/need-setup-process.server'
import { checkNewPasswordPolicy } from '~/features/authentication/server/password-policy.server'
import {
  commitSession,
  establishAuthenticatedSession,
  getSession,
} from '~/features/authentication/server/session.server'
import { setupFirstAccount } from '~/features/authentication/server/setup-first-account.server'
import { LocaleField } from '~/features/authentication/ui/LocaleField'
import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'
import { AuthShell } from '~/shared/ui/AuthShell'
import { AUTH_SUBMIT, AuthField, AuthMessage } from '~/shared/ui/auth-parts'
import { Input } from '~/shared/ui/input'
import { PasswordInput } from '~/shared/ui/PasswordInput'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { cn } from '~/shared/utils/utils'
import type { Route } from './+types/setup'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_setup_page_title()} - Unitae` }]
}

// Setup creates the first admin of a fresh single-tenant install, so it is open only while no
// account exists. The action needs this check as much as the loader: React Router does not run the
// loader before an action.
async function requireSetupAvailable() {
  if (process.env.UNITAE_MULTI_TENANT === 'true') {
    throw redirect('/register')
  }

  if (!(await needSetupProcess())) {
    throw redirect('/login')
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSetupAvailable()

  const session = await getSession(request.headers.get('Cookie'))
  if (session.has('userId')) {
    throw redirect('/')
  }

  return data(
    { error: session.get('error') },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function SetupPage({ loaderData, actionData }: Route.ComponentProps) {
  const { error } = loaderData

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: setupSchema })
    },
  })

  return (
    <AuthShell
      congregation={null}
      eyebrow={m.auth_setup_page_title()}
      title={m.auth_setup_title()}
      description={m.auth_setup_subtitle()}
    >
      {(form.errors?.[0] ?? error) && <AuthMessage tone="error">{form.errors?.[0] ?? error}</AuthMessage>}
      <Form method="post" className="flex flex-col gap-4" {...getFormProps(form)}>
        <AuthField
          id={fields['congregation-name'].id}
          label={m.auth_setup_congregation_name_label()}
          errorId={fields['congregation-name'].errorId}
          errors={fields['congregation-name'].errors}
        >
          <Input {...getInputProps(fields['congregation-name'], { type: 'text' })} autoFocus={true} />
        </AuthField>
        <LocaleField
          id={fields.locale.id}
          name={fields.locale.name}
          initialValue={fields.locale.initialValue}
          label={m.auth_setup_locale_label()}
        />
        <AuthField
          id={fields.email.id}
          label={m.auth_setup_email_label()}
          errorId={fields.email.errorId}
          errors={fields.email.errors}
        >
          <Input {...getInputProps(fields.email, { type: 'email' })} autoComplete="email" />
        </AuthField>
        <AuthField
          id={fields.password.id}
          label={m.auth_setup_password_label()}
          help={m.auth_password_help()}
          errorId={fields.password.errorId}
          errors={fields.password.errors}
        >
          <PasswordInput {...getInputProps(fields.password, { type: 'password' })} autoComplete="new-password" />
        </AuthField>
        <SubmitButton className={cn('mt-1', AUTH_SUBMIT)}>{m.auth_setup_submit()}</SubmitButton>
      </Form>
    </AuthShell>
  )
}

export async function action({ request }: Route.ActionArgs) {
  await requireSetupAvailable()

  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: setupSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { email: username, password, locale, 'congregation-name': congregationName } = submission.value

  // The first account belongs to the admin, so no congregation policy exists
  // yet — zxcvbn strength is enforced, breach-checking is not.
  const policyError = await checkNewPasswordPolicy(password, { checkBreached: false })
  if (policyError) {
    return data(submission.reply({ fieldErrors: { password: [policyError] } }), { status: 400 })
  }

  const userId = await setupFirstAccount(
    username,
    password,
    congregationName,
    'default',
    locale as (typeof locales)[number],
  )

  // A refusal keeps what was typed, like the other refusals of this form.
  if (userId == null) {
    return data(submission.reply({ formErrors: [m.auth_setup_generic_error()] }), { status: 400 })
  }

  // The admin has just chosen this password: they come in straight away rather than type it again on the sign-in page.
  await establishAuthenticatedSession(session, userId)
  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
