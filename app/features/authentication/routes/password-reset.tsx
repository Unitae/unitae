import { Form, redirect } from 'react-router'

import {
  consumePasswordResetToken,
  verifyPasswordResetToken,
} from '~/features/authentication/server/invalidate-user-password.server'
import { resetUserPassword } from '~/features/authentication/server/reset-user-password.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'

import type { Route } from './+types/password-reset'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Connexion - Unitae' }]
}

export async function loader({ params }: Route.LoaderArgs) {
  const user = await verifyPasswordResetToken(params.userHash ?? '')

  if (user == null) {
    throw redirect('/')
  }

  return {
    email: user.email,
    id: user.id,
    active: user.active,
    firstname: user.firstname,
    lastname: user.lastname,
  }
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const user = loaderData

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-16">
        <header className="flex flex-col items-center gap-9">
          <h1 className="leading font-semibold text-5xl text-gray-900 tracking-tight sm:text-7xl dark:text-gray-100">
            Unitae
          </h1>
        </header>
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
              defaultValue={user.email}
              required
              readOnly
            />
          </div>

          <label
            htmlFor="password"
            className="mt-3.5 block font-semibold text-gray-900 text-sm leading-6 dark:text-gray-100"
          >
            Nouveau mot de passe
          </label>
          <div className="mt-2.5">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              className="block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset dark:text-gray-100"
            />
          </div>
          <label
            htmlFor="repeat-password"
            className="mt-3.5 block font-semibold text-gray-900 text-sm leading-6 dark:text-gray-100"
          >
            Entrer à nouveau le mot de passe
          </label>
          <div className="mt-2.5">
            <input
              id="repeat-password"
              name="repeat-password"
              type="password"
              autoComplete="new-password"
              className="block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset dark:text-gray-100"
            />
          </div>

          <div className="mt-12">
            <button
              type="submit"
              className="w-full rounded-sm bg-teal-700 px-4 py-2 text-white hover:bg-teal-900 focus:bg-blue-400"
            >
              Modifier le mot de passe
            </button>
          </div>
        </Form>
      </div>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const form = await request.formData()
  const username = form.get('email')
  const password = form.get('password')
  const repeatPassword = form.get('repeat-password')

  if (password !== repeatPassword) {
    session.flash('error', 'Les mots de passe ne correspondent pas')

    throw redirect(`/password/${params.userHash}/reset`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const user = await verifyPasswordResetToken(params.userHash ?? '')

  if (user == null || user.email !== String(username)) {
    session.flash('error', 'Le lien de réinitialisation est invalide ou expiré')

    throw redirect('/', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  await resetUserPassword(user.id, String(password))
  await consumePasswordResetToken(params.userHash ?? '')

  session.flash('success', 'Mot de passe modifié avec succès')
  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
