import { data, Form, Link, redirect } from 'react-router'

import { needSetupProcess } from '~/features/authentication/server/need-setup-process.server'
import { checkLoginRateLimit, clearLoginAttempts, recordLoginAttempt } from '~/features/authentication/server/rate-limit.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { validateCredentials } from '~/features/authentication/server/validate-credentials.server'

import type { Route } from './+types/login'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Connexion - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const shouldStartSetup = await needSetupProcess()
  if (shouldStartSetup) {
    return redirect(process.env.MULTI_TENANT === 'true' ? '/register' : '/setup')
  }

  const session = await getSession(request.headers.get('Cookie'))
  if (session.has('userId') === true) {
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

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const { error } = loaderData

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-16">
        <header className="flex flex-col items-center gap-9">
          <h1 className="leading font-semibold text-5xl text-gray-900 tracking-tight sm:text-7xl dark:text-gray-100">
            Unitae
          </h1>
        </header>
        {error ? <div className="error">{error}</div> : null}
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
              // biome-ignore lint/a11y/noAutofocus: Here it is a bette UX to focus on the field
              autoFocus={true}
              autoComplete="username"
              required
            />
          </div>

          <label
            htmlFor="password"
            className="mt-3.5 block font-semibold text-gray-900 text-sm leading-6 dark:text-gray-100"
          >
            Mot de passe
          </label>
          <div className="mt-2.5">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset dark:text-gray-100"
            />
          </div>
          <p className="my-1 text-right text-xs">
            <Link to="/password/forgot" className="text-teal-600 underline">
              Mot de passe oublié
            </Link>
          </p>
          <div className="mt-12">
            <button
              type="submit"
              className="w-full rounded-sm bg-teal-700 px-4 py-2 text-white hover:bg-teal-900 focus:bg-blue-400"
            >
              Connexion
            </button>
          </div>
        </Form>
      </div>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const form = await request.formData()
  const username = String(form.get('email'))
  const password = form.get('password')

  const allowed = await checkLoginRateLimit(username)
  if (!allowed) {
    session.flash('error', 'Trop de tentatives. Réessayez dans quelques minutes.')

    return redirect('/login', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const userId = await validateCredentials(username, String(password))

  if (userId == null) {
    await recordLoginAttempt(username)
    session.flash('error', 'Email ou mot de passe invalide')

    return redirect('/login', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  await clearLoginAttempts(username)
  session.set('userId', String(userId))

  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
