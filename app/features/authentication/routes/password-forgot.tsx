import ResetPassword from 'emails/reset-password'
import { data, Form, redirect } from 'react-router'

import { AlertMessages } from '~/shared/ui/AlertMessages'
import { createPasswordResetToken } from '~/features/authentication/server/invalidate-user-password.server'
import { sendResetUserPasswordEmail } from '~/features/authentication/server/send-reset-user-password-email.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { resolveCongregation } from '~/shared/libs/congregation.server'
import { unscopedDb as db } from '~/shared/libs/db.server'

import type { Route } from './+types/password-forgot'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Mot de passe oublié - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get('Cookie'))

  return data(
    { error: session.get('error'), success: session.get('success') },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function ForgotPassword({ loaderData }: Route.ComponentProps) {
  const messages = loaderData

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex max-w-[550px] flex-col items-center gap-16 p-5">
        <header className="flex flex-col items-center gap-9">
          <h1 className="leading font-semibold text-5xl text-gray-900 tracking-tight sm:text-7xl dark:text-gray-100">
            Unitae
          </h1>
          <p>Indiquez votre adresse email pour retrouver votre compte</p>
        </header>
        <AlertMessages messages={messages} />
        <Form method="post" className="w-full">
          <label htmlFor="email" className="block font-semibold text-gray-900 text-sm leading-6 dark:text-gray-100">
            Email
          </label>
          <div className="mt-2.5">
            <input
              id="email"
              name="email"
              type="email"
              className="block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset dark:text-gray-100"
              autoComplete="username"
              // biome-ignore lint/a11y/noAutofocus: Here it is a bette UX to focus on the field
              autoFocus={true}
              required
            />
          </div>

          <div className="mt-12">
            <button
              type="submit"
              className="w-full rounded-sm bg-teal-700 px-4 py-2 text-white hover:bg-teal-900 focus:bg-blue-400"
            >
              Envoyer
            </button>
          </div>
        </Form>
      </div>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData()
  const username = form.get('email')

  const session = await getSession(request.headers.get('Cookie'))
  session.flash(
    'success',
    'Si votre adresse correspond à un compte utilisateur, vous recevrez un email contenant les instructions pour modifier votre mot de passe.',
  )

  const user = await db.user.findFirst({ where: { email: String(username) } })

  if (user == null) {
    throw redirect('/password/forgot', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const token = await createPasswordResetToken(user.id)
  const congregation = await resolveCongregation(user.congregationId)
  await sendResetUserPasswordEmail(
    user.id,
    <ResetPassword
      email={user.email}
      firstname={user.firstname || undefined}
      token={token}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />,
  )

  return redirect('/password/forgot', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
