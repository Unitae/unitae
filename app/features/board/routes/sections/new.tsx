import { Form, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Création de section sur Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  return null
}

export default function NewSectionPage({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Nouvelle section</h1>
          <p className="text-gray-500 max-sm:text-sm">Créer une nouvelle section sur le tableau d'affichage</p>
        </div>
        <div />
      </div>

      <Form method="post" className="my-5 flex flex-col gap-3">
        <label>
          Nom
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="name"
            type="text"
            placeholder="Nom de la section"
          />
        </label>
        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Créer la section
        </button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { session } = await verifySession(request)
  const form = await request.formData()
  const name = String(form.get('name'))

  if (name.length < 1) {
    session.flash('error', 'Vous devez remplir tous les champs du formulaire. Réessayez.')
    throw redirect('/board/sections/new')
  }

  const section = await db.boardSection.create({
    data: {
      name: String(name),
      congregationId: 0 as number,
    },
  })

  if (section == null) {
    session.flash('error', `Quelque chose s'est mal passé. Réessayez.`)

    return redirect('/board', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  session.flash('success', `Section "${section.name}" créée avec succès.`)

  return redirect(`/board/sections/${section.id}/edit`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
