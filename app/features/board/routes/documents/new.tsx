import { type FileUpload, parseFormData } from '@mjackson/form-data-parser'
import { Form, redirect } from 'react-router'

import { saveFile } from '~/features/board/server/document'
import { sendNewDocumentNotificationEmail } from '~/features/board/server/notifications'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { requireCongregation } from '~/shared/libs/congregation.server'
import { db } from '~/shared/libs/db.server'
import { LimitService } from '~/shared/libs/limits.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Création de section sur Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canUploadDocument = await verifyRole(request, Role.BoardUploader)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canUploadDocument) {
    logger.warn(
      `Tried to upload new document. User ID: ${currentUser.id}. Does NOT have rights to upload file to the board.`,
    )
    throw redirect('/')
  }

  logger.info(
    `Loading creation form for document. User ID: ${currentUser.id}. ${canUploadDocument ? 'Has' : 'Does NOT have'} rights to upload new document to the board.`,
  )

  const sections = await db.boardSection.findMany()

  return { sections, rights: { canUploadDocument, canManageBoard } }
}

export default function NewDocumentPage({ loaderData }: Route.ComponentProps) {
  const { sections, rights } = loaderData
  const currentDate = new Date()
  currentDate.setMinutes(currentDate.getMinutes() - currentDate.getTimezoneOffset())
  const formattedDate = currentDate.toISOString().slice(0, 16)

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Nouveau document</h1>
          <p className="text-gray-500 max-sm:text-sm">Ajouter un nouveau document sur le tableau d'affichage</p>
        </div>
        <div />
      </div>

      <Form method="post" className="my-5 flex flex-col gap-3" encType="multipart/form-data">
        <div className="flex gap-3">
          <label className="flex-1">
            Nom
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="name"
              type="text"
              placeholder="Nom du document"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="flex gap-3">
          <label className="flex-1">
            Section
            <select
              className="h-[34px] w-full appearance-none rounded-md border p-1 dark:border-gray-300"
              name="sectionId"
            >
              {sections.map(section => (
                <option key={section.id} value={section.id}>
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
                defaultValue={formattedDate}
              />
            </label>
            <label className="flex-1">
              Visible jusqu'au :
              <input
                className="w-full rounded-md border p-1 dark:border-gray-300"
                name="visible-until"
                type="datetime-local"
                placeholder="Fin de la période de visibilité"
              />
            </label>
          </div>
        )}

        <div className="flex gap-3">
          <label className="flex-1">
            Fichier à uploader :
            <br />
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="document"
              type="file"
              accept="application/pdf"
            />
          </label>
        </div>

        {rights.canManageBoard && (
          <label
            className="flex grow items-center gap-1 max-sm:gap-3"
            title={`Le document s'affichera également tout en haut du tableau d'affichage pour être visible par tous`}
          >
            <input className={'rounded-md border dark:border-gray-300'} name="hightlighted" type="checkbox" />
            <span>Mettre en avant le document sur le tableau d'affichage</span>
          </label>
        )}

        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Envoyer le document
        </button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, session } = await verifySession(request)

  const canUploadDocument = await verifyRole(request, Role.BoardUploader)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canUploadDocument) {
    logger.warn(
      `Tried to upload new document. User ID: ${currentUser.id}. Does NOT have rights to upload file to the board.`,
    )
    throw redirect('/')
  }

  let uploadedFile: File | null = null
  const uploadHandler = async (fileUpload: FileUpload) => {
    if (fileUpload.fieldName === 'document') {
      const chunks: Uint8Array[] = []
      const reader = fileUpload.stream().getReader()
      let done = false
      while (!done) {
        const result = await reader.read()
        if (result.value) chunks.push(result.value)
        done = result.done
      }
      const blob = new Blob(chunks as BlobPart[], { type: fileUpload.type })
      uploadedFile = new File([blob], fileUpload.name, { type: fileUpload.type })
      return uploadedFile
    }

    logger.warn(`Issue on file creation. User ID: ${currentUser.id}. Bad field name.`, { currentUser, fileUpload })
  }

  const form = await parseFormData(request, uploadHandler)
  const file = uploadedFile ?? (form.get('document') as File | null)
  const name = String(form.get('name'))
  const sectionId = Number(form.get('sectionId'))
  const visibleFrom = new Date(String(form.get('visible-from')))
  const visibleUntil = new Date(String(form.get('visible-until')))
  const isHighlighted = form.get('hightlighted') === 'on'

  if (name.length < 1) {
    logger.warn(`Document creation failed. User ID: ${currentUser.id}. Name is empty.`, {
      currentUser,
      form: { name, sectionId, file },
    })
    session.flash('error', 'Vous devez remplir tous les champs du formulaire. Réessayez.')
    throw redirect('/board/documents/new')
  }

  if (file == null || name == null) {
    logger.warn(
      `Document creation failed. User ID: ${currentUser.id}. ${file == null ? 'File is empty' : 'File is not empty'}.`,
      { currentUser, form: { name, sectionId, file } },
    )
    session.flash('error', 'Vous devez remplir tous les champs du formulaire. Réessayez.')
    throw redirect('/board/documents/new')
  }

  const congregation = requireCongregation()
  const limits = new LimitService(congregation)
  await limits.errorIfWouldGoOverLimit('boardDocuments')

  const storageKey = await saveFile(file)

  const document = await db.boardDocument.create({
    data: {
      title: String(name),
      type: 'pdf',
      uri: storageKey,
      sectionId: sectionId,
      order: 0,
      congregationId: 0 as number,
      ...(visibleFrom.getTime() > 0
        ? {
            visibleFrom,
          }
        : {}),
      ...(visibleUntil.getTime() > 0
        ? {
            visibleUntil,
          }
        : {}),
      ...(form.has('hightlighted')
        ? {
            isHighlighted: isHighlighted,
          }
        : {}),
    },
  })

  if (document == null) {
    session.flash('error', `Quelque chose s'est mal passé. Réessayez.`)
    logger.warn(`Document creation failed. User ID: ${currentUser.id}. Database entity not created.`, {
      currentUser,
      form: { name, sectionId, file },
      document,
    })
    return redirect('/board/documents', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  session.flash('success', `Document "${document.title}" créée avec succès.`)
  logger.info(`Document created. User ID: ${currentUser.id}. Document ID: ${document.id}. File key: ${storageKey}.`, {
    currentUser,
    document,
  })

  if (!canManageBoard) {
    sendNewDocumentNotificationEmail({ document })
  }

  return redirect(`/board/documents/${document.id}/edit`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
