import { data, Form, redirect } from 'react-router'

import { needSetupProcess } from '~/features/authentication/server/need-setup-process.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { setupFirstUser } from '~/features/authentication/server/setup-first-user.server'

import type { Route } from './+types/setup'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Installation - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  if (process.env.MULTI_TENANT === 'true') {
    throw redirect('/register')
  }

  const shouldStartSetup = await needSetupProcess()
  if (!shouldStartSetup) {
    throw redirect('/login')
  }

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

export default function SignupPage({ loaderData }: Route.ComponentProps) {
  const { error } = loaderData

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-16">
        <header className="flex flex-col items-center gap-9">
          <h1 className="leading font-semibold text-5xl text-gray-900 tracking-tight sm:text-7xl dark:text-gray-100">
            Unitae
          </h1>
        </header>
        <p>Création du premier utilisateur pour l'accès à la plateforme.</p>
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
              // biome-ignore lint/a11y/noAutofocus: setup page should focus email
              autoFocus={true}
              autoComplete="email"
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
              autoComplete="new-password"
              className="block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset dark:text-gray-100"
            />
          </div>
          <label
            htmlFor="repeat-password"
            className="mt-3.5 block font-semibold text-gray-900 text-sm leading-6 dark:text-gray-100"
          >
            Répéter le mot de passe
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

          <div className="mt-11">
            <button
              type="submit"
              className="w-full rounded-sm bg-teal-700 px-4 py-2 text-white hover:bg-teal-900 focus:bg-blue-400"
            >
              Créer l'utilisateur
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
  const username = form.get('email')
  const password = form.get('password')
  const secondPassword = form.get('repeat-password')

  if (password !== secondPassword) {
    session.flash('error', 'Les mots de passe ne sont pas les mêmes')
    return redirect('/setup', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  if (String(username).length < 5 || !String(username).includes('@')) {
    session.flash('error', 'Utilisez une adresse email valide')
    return redirect('/setup', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  const userId = await setupFirstUser(String(username), String(password), 'Ma Congrégation', 'default')

  if (userId == null) {
    session.flash('error', `Quelque chose s'est mal passé. Réessayez.`)

    return redirect('/setup', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return redirect('/login')
}
