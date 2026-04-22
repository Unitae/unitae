import { parseWithZod } from '@conform-to/zod'
import { type FileUpload, MaxFileSizeExceededError, parseFormData } from '@mjackson/form-data-parser'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { createDocumentSchema } from '~/features/display-board/schemas/board-document.schema'
import { createBoardDocument } from '~/features/display-board/server/board-document.server'
import { saveFile } from '~/features/display-board/server/document.server'
import { emailQueue } from '~/features/display-board/server/email-queue.server'
import {
  FileValidationError,
  MAX_FILE_SIZE_BYTES,
  validateBoardFile,
  validateVisibilityDates,
} from '~/features/display-board/server/file-validation.server'
import { thumbnailQueue } from '~/features/display-board/server/thumbnail-queue.server'
import * as m from '~/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  userContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitService } from '~/shared/domain/limits.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Création de section sur Tableau d'affichage - Unitae` }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canUploadDocument = permissions.has(Role.BoardUploader)
  const canManageBoard = permissions.has(Role.BoardValidator)

  if (!canUploadDocument) {
    logger.warn(
      `Tried to upload new document. User ID: ${currentUser.id}. Does NOT have rights to upload file to the board.`,
    )
    throw redirect('/')
  }

  logger.info(
    `Loading creation form for document. User ID: ${currentUser.id}. ${canUploadDocument ? 'Has' : 'Does NOT have'} rights to upload new document to the board.`,
  )

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
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
      <PageHeader title={m.board_documents_new_title()} subtitle={m.board_documents_new_subtitle()} />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4" encType="multipart/form-data">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{m.board_documents_new_name_label()}</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder={m.board_documents_new_name_placeholder()}
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="sectionId">{m.board_documents_new_section_label()}</Label>
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
                  <Label htmlFor="visible-from">{m.board_documents_new_visible_from_label()}</Label>
                  <Input
                    id="visible-from"
                    name="visible-from"
                    type="datetime-local"
                    placeholder={m.board_documents_new_visible_from_placeholder()}
                    defaultValue={formattedDate}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="visible-until">{m.board_documents_new_visible_until_label()}</Label>
                  <Input
                    id="visible-until"
                    name="visible-until"
                    type="datetime-local"
                    placeholder={m.board_documents_new_visible_until_placeholder()}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="document">{m.board_documents_new_file_label()}</Label>
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
                  title={m.board_documents_new_highlight_tooltip()}
                >
                  {m.board_documents_new_highlight_label()}
                </Label>
              </div>
            )}

            <SubmitButton className="w-fit">{m.board_documents_new_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const congregation = context.get(congregationContext)
  const session = await getSession(request.headers.get('Cookie'))
  const canUploadDocument = permissions.has(Role.BoardUploader)
  const canManageBoard = permissions.has(Role.BoardValidator)

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

  let form: FormData
  try {
    form = await parseFormData(request, { maxFileSize: MAX_FILE_SIZE_BYTES }, uploadHandler)
  } catch (error) {
    if (error instanceof MaxFileSizeExceededError) {
      session.flash('error', m.board_documents_invalid_file())
      return redirect('/board/documents/new', {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }
    throw error
  }
  const file = uploadedFile ?? (form.get('document') as File | null)
  const submission = parseWithZod(form, { schema: createDocumentSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { name, sectionId } = submission.value
  const visibleFrom = new Date(submission.value['visible-from'])
  const visibleUntil = new Date(submission.value['visible-until'])
  const isHighlighted = submission.value.hightlighted === 'on'

  if (file == null) {
    logger.warn(`Document creation failed. User ID: ${currentUser.id}. File is empty.`, {
      currentUser,
      form: { name, sectionId, file },
    })
    session.flash('error', m.common_empty_fields_error())
    throw redirect('/board/documents/new')
  }

  const parsedFrom = visibleFrom.getTime() > 0 ? visibleFrom : null
  const parsedUntil = visibleUntil.getTime() > 0 ? visibleUntil : null
  if (!validateVisibilityDates(parsedFrom, parsedUntil)) {
    session.flash('error', m.board_documents_date_range_error())
    return redirect('/board/documents/new', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    const limits = new LimitService(db, congregation)
    await limits.errorIfWouldGoOverLimit('boardDocuments')

    try {
      await validateBoardFile(file)
    } catch (error) {
      if (error instanceof FileValidationError) {
        logger.warn(`Document creation failed. User ID: ${currentUser.id}. File validation: ${error.messageKey}.`, {
          currentUser,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        })
        session.flash('error', m.board_documents_invalid_file())
        return redirect('/board/documents/new', {
          headers: { 'Set-Cookie': await commitSession(session) },
        })
      }
      throw error
    }

    const storageKey = await saveFile(congregationId, file)

    const document = await createBoardDocument(db, {
      title: String(name),
      sectionId,
      uri: storageKey,
      congregationId,
      visibleFrom: parsedFrom,
      visibleUntil: parsedUntil,
      ...(submission.value.hightlighted != null ? { isHighlighted } : {}),
    })

    if (document == null) {
      session.flash('error', m.common_generic_error())
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

    session.flash('success', m.board_documents_new_success({ name: document.title }))
    logger.info(`Document created. User ID: ${currentUser.id}. Document ID: ${document.id}. File key: ${storageKey}.`, {
      currentUser,
      document,
    })

    await thumbnailQueue.add('generate-thumbnail', {
      congregationId,
      documentId: document.id,
      pdfStorageKey: storageKey,
    })

    if (!canManageBoard) {
      await emailQueue.add('new-document-notification', {
        type: 'new-document-notification',
        congregationId,
        documentId: document.id,
      })
    }

    return redirect(`/board/documents/${document.id}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
