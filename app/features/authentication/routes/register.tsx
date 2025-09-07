import { data, Form, Link, redirect } from 'react-router'

import { AlertMessages } from '~/shared/ui/AlertMessages'
import { registerCongregation } from '~/features/authentication/server/register-congregation.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'

import type { Route } from './+types/register'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Créer une congrégation - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  if (process.env.MULTI_TENANT !== 'true') {
    throw redirect('/login')
  }

  const session = await getSession(request.headers.get('Cookie'))

  return data(
    { error: session.get('error'), success: session.get('success') },
    { headers: { 'Set-Cookie': await commitSession(session) } },
  )
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function RegisterPage({ loaderData }: Route.ComponentProps) {
  const messages = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex w-full max-w-[550px] flex-col items-center gap-8 p-5">
        <header className="flex flex-col items-center gap-4">
          <h1 className="font-semibold text-5xl text-gray-900 tracking-tight sm:text-7xl dark:text-gray-100">Unitae</h1>
          <p className="text-center text-gray-600 dark:text-gray-400">Créer un espace pour votre congrégation</p>
        </header>
        <AlertMessages messages={messages} />
        <Form method="post" className="flex w-full flex-col gap-4">
          <div>
            <label
              htmlFor="congregation-name"
              className="block font-semibold text-gray-900 text-sm leading-6 dark:text-gray-100"
            >
              Nom de la congrégation
            </label>
            <input
              id="congregation-name"
              name="congregation-name"
              type="text"
              className="mt-2 block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-teal-600 focus:ring-inset dark:text-gray-100"
              placeholder="Lyon Confluence"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="block font-semibold text-gray-900 text-sm leading-6 dark:text-gray-100">
              Email de l'administrateur
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="mt-2 block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-teal-600 focus:ring-inset dark:text-gray-100"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block font-semibold text-gray-900 text-sm leading-6 dark:text-gray-100"
            >
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              className="mt-2 block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-teal-600 focus:ring-inset dark:text-gray-100"
              required
            />
          </div>

          <div>
            <label
              htmlFor="repeat-password"
              className="block font-semibold text-gray-900 text-sm leading-6 dark:text-gray-100"
            >
              Confirmer le mot de passe
            </label>
            <input
              id="repeat-password"
              name="repeat-password"
              type="password"
              autoComplete="new-password"
              className="mt-2 block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-teal-600 focus:ring-inset dark:text-gray-100"
              required
            />
          </div>

          <button
            type="submit"
            className="mt-4 w-full rounded-md bg-teal-700 px-4 py-2.5 font-semibold text-white hover:bg-teal-900 focus:bg-teal-800"
          >
            Créer la congrégation
          </button>
        </Form>

        <p className="text-sm text-gray-500">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-teal-600 underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const form = await request.formData()

  const congregationName = String(form.get('congregation-name')).trim()
  const email = String(form.get('email')).trim()
  const password = String(form.get('password'))
  const repeatPassword = String(form.get('repeat-password'))

  if (congregationName.length < 2) {
    session.flash('error', 'Le nom de la congrégation doit faire au moins 2 caractères.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  if (!email.includes('@') || email.length < 5) {
    session.flash('error', 'Utilisez une adresse email valide.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  if (password.length < 8) {
    session.flash('error', 'Le mot de passe doit faire au moins 8 caractères.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  if (password !== repeatPassword) {
    session.flash('error', 'Les mots de passe ne correspondent pas.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  const slug = slugify(congregationName)
  if (slug.length < 2) {
    session.flash('error', 'Le nom de la congrégation génère un identifiant invalide.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  const result = await registerCongregation(congregationName, slug, email, password)

  if ('error' in result) {
    session.flash('error', result.error ?? 'Une erreur est survenue.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  session.set('userId', String(result.userId))

  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
