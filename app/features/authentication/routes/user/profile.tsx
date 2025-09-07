import { Form, redirect } from 'react-router'
import { changeUserPassword } from '~/features/authentication/server/change-user-password.server'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import logger from '~/shared/libs/logger.server'
import type { Route } from './+types/profile'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Mon profil - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, session } = await verifySession(request)

  logger.info(`Loading profile data. User ID: ${currentUser.id}.`)

  return {
    user: {
      id: currentUser.id,
      email: currentUser.email,
      lastname: currentUser.lastname,
      firstname: currentUser.firstname,
      isPublisher: currentUser.isPublisher,
    },
    error: session.get('error'),
  }
}

export default function ProfilePage({ loaderData }: Route.ComponentProps) {
  const { user, error } = loaderData

  return (
    <div className="m-3 flex grow flex-col gap-6 pb-3">
      <h1 className="font-bold text-4xl">Mon profil</h1>
      <p>
        Tu trouveras sur cette page ton profile. C'est-à-dire tout ce que tu dois savoir en rapport avec ton usage de
        l'outil Unitae.
      </p>
      <section className="flex flex-col gap-3 rounded-md bg-gray-900 p-5 text-white">
        <h2 className="mb-4 text-xl">Mon compte</h2>
        <p>
          Nom : <span className="text-teal-600">{user.lastname?.toLocaleUpperCase()}</span>
        </p>
        <p>
          Prénom : <span className="text-teal-600">{user.firstname}</span>
        </p>
        <p>
          Adresse email : <span className="text-teal-600">{user.email.toLocaleLowerCase()}</span>
        </p>
        <p>
          Proclamateur à Unitae : <span className="text-teal-600">{user.isPublisher ? 'Oui' : 'Non'}</span>
        </p>
        <p className="pt-5 text-sm italic">
          Si certaines de ces informations ne sont pas bonnes, merci de contacter ton responsable de groupe de
          prédication.
        </p>
      </section>

      <section className="rounded-md bg-gray-900 p-5 text-white">
        <h2 className="mb-4 text-xl">Mon mots de passe</h2>
        {error && <p className="text-red-600">{error}</p>}

        <p>Veuillez saisir votre nouveau mot de passe.</p>
        <Form method="post" className="flex grow flex-col gap-3">
          <label>
            Mot de passe actuel
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Mot de passe actuel"
            />
          </label>
          <label>
            Nouveau mot de passe
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="new_password"
              type="password"
              autoComplete="new-password"
              placeholder="Nouveau mot de passe"
            />
          </label>
          <button
            type="submit"
            className="max-w-fit rounded-lg bg-teal-600 px-3 py-1 font-semibold text-white hover:bg-teal-900"
          >
            Changer mon mot de passe
          </button>
        </Form>
      </section>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { session, currentUser } = await verifySession(request)
  const formData = await request.formData()
  const password = formData.get('password')
  const newPassword = formData.get('new_password')

  const isSuccess = await changeUserPassword(currentUser.id, String(password), String(newPassword))

  if (!isSuccess) {
    session.flash('error', 'Impossible modifier le mot de passe.')
    return redirect('/me/profile', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return redirect('/profile', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
