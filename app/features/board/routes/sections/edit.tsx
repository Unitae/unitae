import { Form, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { DeleteLink } from '~/shared/ui/DeleteLink'
import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Modification d'une section du Tableau d'affichage - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  const section = await db.boardSection.findUnique({
    where: {
      id: requireParamId(params.sectionId, '/board'),
    },
  })

  if (section == null) throw redirect('/board/sections')

  return { section }
}

export default function EditSectionPage({ loaderData }: Route.ComponentProps) {
  const { section } = loaderData

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Modification d'une section</h1>
          <p className="text-gray-500 max-sm:text-sm">Modifier une section du tableau d'affichage</p>
        </div>
        <div className="flex gap-2">
          <DeleteLink action={`/board/sections/${section.id}/delete`} title="Supprimer complètement la section" />
        </div>
      </div>

      <Form method="post" className="my-5 flex flex-col gap-3">
        <div className="flex gap-3">
          <label className="flex-1">
            Nom
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="name"
              type="text"
              placeholder="Nom de la section"
              defaultValue={section.name ?? ''}
            />
          </label>
        </div>

        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Modifier la section
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session } = await verifySession(request)
  const form = await request.formData()
  const name = String(form.get('name'))

  if (name.length < 1) {
    session.flash('error', 'Vous devez remplir tous les champs du formulaire. Réessayez.')
    throw redirect('/board/sections/new')
  }

  const section = await db.boardSection.update({
    where: {
      id: requireParamId(params.sectionId, '/board'),
    },
    data: {
      name: String(name),
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

  session.flash('success', `Section "${section.name}" modifiée avec succès.`)

  return redirect(`/board/sections/${section.id}/edit`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
