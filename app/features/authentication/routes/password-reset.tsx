import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { resetPasswordSchema } from '~/features/authentication/schemas/login.schema'
import { isAccountInBreachScope } from '~/features/authentication/server/breach-scope.server'
import {
  consumePasswordResetToken,
  verifyPasswordResetToken,
} from '~/features/authentication/server/invalidate-account-password.server'
import { checkNewPasswordPolicy } from '~/features/authentication/server/password-policy.server'
import { resetAccountPassword } from '~/features/authentication/server/reset-account-password.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'
import { getBrandingName, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { withScope } from '~/shared/infra/db.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import type { Route } from './+types/password-reset'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_password_reset_page_title()} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await resolveCongregationFromRequest(request)

  const user = await verifyPasswordResetToken(params.userHash ?? '')

  if (user == null) {
    throw redirect('/')
  }

  const brandingName = await getBrandingName(request)

  return {
    email: user.email,
    id: user.id,
    active: user.active,
    firstname: user.firstname,
    lastname: user.lastname,
    brandingName,
  }
}

export default function PasswordResetPage({ loaderData, actionData }: Route.ComponentProps) {
  const { brandingName, ...user } = loaderData

  const [form, fields] = useForm({
    lastResult: actionData,
    defaultValue: { email: user.email },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: resetPasswordSchema })
    },
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md overflow-hidden shadow-md">
        <div className="h-1 bg-primary" />
        <CardHeader className="items-center space-y-2 text-center">
          <h1 className="font-bold font-display text-2xl tracking-tight">{brandingName}</h1>
          <p className="text-muted-foreground text-sm">{m.auth_password_reset_subtitle()}</p>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4" {...getFormProps(form)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.email.id}>{m.auth_password_reset_email_label()}</Label>
              <Input
                {...getInputProps(fields.email, { type: 'email' })}
                autoComplete="username"
                readOnly
                className="bg-muted"
              />
              {fields.email.errors && <p className="text-destructive text-sm">{fields.email.errors}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.password.id}>{m.auth_password_reset_new_password_label()}</Label>
              <Input {...getInputProps(fields.password, { type: 'password' })} autoComplete="new-password" />
              {fields.password.errors && <p className="text-destructive text-sm">{fields.password.errors}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.passwordConfirm.id}>{m.auth_password_reset_confirm_password_label()}</Label>
              <Input {...getInputProps(fields.passwordConfirm, { type: 'password' })} autoComplete="new-password" />
              {fields.passwordConfirm.errors && (
                <p className="text-destructive text-sm">{fields.passwordConfirm.errors}</p>
              )}
            </div>

            <Button type="submit" className="mt-4 w-full">
              {m.auth_password_reset_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
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
    session.flash('error', m.auth_password_reset_invalid_token_error())

    throw redirect('/', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const checkBreached = await withScope(user.congregationId, db =>
    isAccountInBreachScope(db, user.id, user.congregationId),
  )
  const policyError = await checkNewPasswordPolicy(password, { checkBreached })
  if (policyError) {
    return data(submission.reply({ fieldErrors: { password: [policyError] } }), { status: 400 })
  }

  await resetAccountPassword(user.id, password)
  await consumePasswordResetToken(params.userHash ?? '')

  session.flash('success', m.auth_password_reset_success_message())
  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
