import { type FileUpload, parseFormData } from '@mjackson/form-data-parser'
import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { saveFile } from '~/features/board/server/document'
import { sendNewDocumentNotificationEmail } from '~/features/board/server/notifications'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { LimitService } from '~/shared/libs/limits.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Création de section sur Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.BoardUploader,
    Role.BoardValidator,
  ])
  const canUploadDocument = can(Role.BoardUploader)
  const canManageBoard = can(Role.BoardValidator)

  if (!canUploadDocument) {
    logger.warn(
      `Tried to upload new document. User ID: ${currentUser.id}. Does NOT have rights to upload file to the board.`,
    )
    throw redirect('/')
  }

  logger.info(
    `Loading creation form for document. User ID: ${currentUser.id}. ${canUploadDocument ? 'Has' : 'Does NOT have'} rights to upload new document to the board.`,
  )

  return withScope(congregationId, async db => {
    const sections = await db.boardSection.findMany({ where: { congregationId } })

    return { sections, rights: { canUploadDocument, canManageBoard } }
  })
}

export default function NewDocumentPage({ loaderData }: Route.ComponentProps) {
  const { sections, rights } = loaderData
  const currentDate = new Date()
  currentDate.setMinutes(currentDate.getMinutes() - currentDate.getTimezoneOffset())
  const formattedDate = currentDate.toISOString().slice(0, 16)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nouveau document" subtitle="Ajouter un nouveau document sur le tableau d'affichage" />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4" encType="multipart/form-data">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" type="text" placeholder="Nom du document" autoComplete="off" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="sectionId">Section</Label>
              <select
                id="sectionId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                name="sectionId"
              >
                {sections.map(section => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>

            {rights.canManageBoard && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="visible-from">Visible à partir du</Label>
                  <Input
                    id="visible-from"
                    name="visible-from"
                    type="datetime-local"
                    placeholder="Début de la période de visibilité"
                    defaultValue={formattedDate}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="visible-until">Visible jusqu'au</Label>
                  <Input
                    id="visible-until"
                    name="visible-until"
                    type="datetime-local"
                    placeholder="Fin de la période de visibilité"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="document">Fichier à uploader</Label>
              <Input id="document" name="document" type="file" accept="application/pdf" />
            </div>

            {rights.canManageBoard && (
              <div className="flex items-center gap-2">
                <input
                  id="hightlighted"
                  className="size-4 rounded border border-input accent-primary"
                  name="hightlighted"
                  type="checkbox"
                />
                <Label
                  htmlFor="hightlighted"
                  className="cursor-pointer font-normal"
                  title="Le document s'affichera également tout en haut du tableau d'affichage pour être visible par tous"
                >
                  Mettre en avant le document sur le tableau d'affichage
                </Label>
              </div>
            )}

            <Button type="submit" className="w-fit">
              Envoyer le document
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, session, congregation, congregationId, can } = await authenticateAndAuthorize(request, [
    Role.BoardUploader,
    Role.BoardValidator,
  ])
  const canUploadDocument = can(Role.BoardUploader)
  const canManageBoard = can(Role.BoardValidator)

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

  return withScope(congregationId, async db => {
    const limits = new LimitService(db, congregation)
    await limits.errorIfWouldGoOverLimit('boardDocuments')

    const storageKey = await saveFile(congregationId, file)

    const document = await db.boardDocument.create({
      data: {
        title: String(name),
        type: 'pdf',
        uri: storageKey,
        sectionId: sectionId,
        order: 0,
        congregationId,
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
      sendNewDocumentNotificationEmail(db, congregation, { document })
    }

    return redirect(`/board/documents/${document.id}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
