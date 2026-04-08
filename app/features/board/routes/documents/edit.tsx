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
  const canUploadDocument = await verifyRole(request, Role.BoardUploader)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canUploadDocument) {
    throw redirect('/')
  }

  const document = await db.boardDocument.findUnique({
    where: {
      id: requireParamId(params.documentId, '/board'),
    },
  })

  const sections = await db.boardSection.findMany()

  if (document == null) throw redirect('/board/documents')

  return { document, sections, rights: { canManageBoard, canUploadDocument } }
}

export default function EditDocumentPage({ loaderData }: Route.ComponentProps) {
  const { document, sections, rights } = loaderData

  let formattedVisibleFrom = ''
  if (document.visibleFrom !== null) {
    const visibleFrom = new Date(document.visibleFrom)
    visibleFrom.setMinutes(visibleFrom.getMinutes() - visibleFrom.getTimezoneOffset())
    formattedVisibleFrom = visibleFrom.toISOString().slice(0, 16)
  }

  let formattedVisibleUntil = ''
  if (document.visibleUntil !== null) {
    const visibleUntil = new Date(document.visibleUntil)
    visibleUntil.setMinutes(visibleUntil.getMinutes() - visibleUntil.getTimezoneOffset())
    formattedVisibleUntil = visibleUntil.toISOString().slice(0, 16)
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Modification d'un document</h1>
          <p className="text-gray-500 max-sm:text-sm">Modifier un document du tableau d'affichage</p>
        </div>
        <div className="flex gap-2">
          <DeleteLink action={`/board/documents/${document.id}/delete`} title="Supprimer complètement le document" />
        </div>
      </div>

      <Form method="post" className="my-5 flex flex-col gap-3">
        <div className="flex gap-3">
          <label className="flex-1">
            Nom
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="title"
              type="text"
              placeholder="Nom du document"
              autoComplete="off"
              defaultValue={document.title ?? ''}
            />
          </label>
        </div>
        <div className="flex gap-3">
          <label className="flex-1">
            Section
            <select
              className="h-[34px] w-full appearance-none rounded-md border p-1 dark:border-gray-300"
              name="sectionId"
              defaultValue={document.sectionId}
            >
              {sections.map(section => (
                <option key={section.id} value={section.id} className="dark:bg-slate-950">
                  {section.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {rights.canManageBoard && (
          <div className="flex gap-3">
            <label className="flex-1">
              Visible à partir du :
              <input
                className="w-full rounded-md border p-1 dark:border-gray-300"
                name="visible-from"
                type="datetime-local"
                placeholder="Début de la période de visibilité"
                defaultValue={formattedVisibleFrom}
              />
            </label>
            <label className="flex-1">
              Visible jusqu'au :
              <input
                className="w-full rounded-md border p-1 dark:border-gray-300"
                name="visible-until"
                type="datetime-local"
                placeholder="Fin de la période de visibilité"
                defaultValue={formattedVisibleUntil}
              />
            </label>
          </div>
        )}

        {rights.canManageBoard && (
          <label
            className="flex grow items-center gap-1 max-sm:gap-3"
            title={`Le document s'affichera également tout en haut du tableau d'affichage pour être visible par tous`}
          >
            <input
              className={'rounded-md border dark:border-gray-300'}
              name="hightlighted"
              type="checkbox"
              defaultChecked={document.isHighlighted}
            />
            <span>Mettre en avant le document sur le tableau d'affichage</span>
          </label>
        )}

        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Modifier le document
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session } = await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  const form = await request.formData()
  const title = String(form.get('title'))
  const sectionId = Number(form.get('sectionId'))
  const visibleFrom = new Date(String(form.get('visible-from')))
  const visibleUntil = new Date(String(form.get('visible-until')))
  const isHighlighted = form.get('hightlighted') === 'on'

  if (title.length < 1) {
    session.flash('error', 'Vous devez remplir tous les champs du formulaire. Réessayez.')
    throw redirect(`/board/document/${params.documentId}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  const document = await db.boardDocument.update({
    where: {
      id: requireParamId(params.documentId, '/board'),
    },
    data: {
      title: String(title),
      section: {
        connect: {
          id: sectionId,
        },
      },
      visibleFrom: visibleFrom.getTime() > 0 ? visibleFrom : canManageBoard ? null : undefined,
      visibleUntil: visibleUntil.getTime() > 0 ? visibleUntil : canManageBoard ? null : undefined,
      ...(form.has('hightlighted')
        ? {
            isHighlighted: isHighlighted,
          }
        : {}),
    },
  })

  if (document == null) {
    session.flash('error', `Quelque chose s'est mal passé. Réessayez.`)

    return redirect(`/board/document/${params.documentId}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  session.flash('success', `Section "${document.title}" modifiée avec succès.`)

  return redirect(`/board/documents/${document.id}/edit`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
