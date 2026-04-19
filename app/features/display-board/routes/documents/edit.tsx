import { type FileUpload, MaxFileSizeExceededError, parseFormData } from '@mjackson/form-data-parser'
import { History, Trash2 } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { updateBoardDocument } from '~/features/display-board/server/board-document.server'
import { replaceDocumentFile } from '~/features/display-board/server/document.server'
import { MAX_FILE_SIZE_BYTES, validateVisibilityDates } from '~/features/display-board/server/file-validation.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { requireParamId } from '~/shared/utils/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_documents_edit_meta_title() }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardUploader, Role.BoardValidator])
  const canUploadDocument = can(Role.BoardUploader)
  const canManageBoard = can(Role.BoardValidator)

  if (!canUploadDocument) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const document = await db.boardDocument.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: requireParamId(params.documentId, '/board'), congregationId },
      },
    })

    const sections = await db.boardSection.findMany({ where: { congregationId } })

    if (document == null) throw redirect('/board/documents')

    return { document, sections, rights: { canManageBoard, canUploadDocument } }
  })
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.board_documents_edit_title()}
        subtitle={m.board_documents_edit_subtitle()}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="icon" asChild>
              <Link to={`/board/documents/${document.id}/versions`} title={m.board_versions_link_tooltip()}>
                <History className="size-4" />
              </Link>
            </Button>
            <Button variant="destructive" size="icon" asChild>
              <Link to={`/board/documents/${document.id}/delete`} title={m.board_documents_delete_tooltip()}>
                <Trash2 className="size-4" />
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4" encType="multipart/form-data">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">{m.board_documents_new_name_label()}</Label>
              <Input
                id="title"
                name="title"
                type="text"
                placeholder={m.board_documents_new_name_placeholder()}
                autoComplete="off"
                defaultValue={document.title ?? ''}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="sectionId">{m.board_documents_new_section_label()}</Label>
              <select
                id="sectionId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                name="sectionId"
                defaultValue={document.sectionId}
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
                    defaultValue={formattedVisibleFrom}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="visible-until">{m.board_documents_new_visible_until_label()}</Label>
                  <Input
                    id="visible-until"
                    name="visible-until"
                    type="datetime-local"
                    placeholder={m.board_documents_new_visible_until_placeholder()}
                    defaultValue={formattedVisibleUntil}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="document">{m.board_documents_edit_replace_file_label()}</Label>
              <Input id="document" name="document" type="file" accept="application/pdf" />
              <p className="text-muted-foreground text-xs">{m.board_documents_edit_replace_file_hint()}</p>
            </div>

            {rights.canManageBoard && (
              <div className="flex items-center gap-2">
                <input
                  id="hightlighted"
                  className="size-4 rounded border border-input accent-primary"
                  name="hightlighted"
                  type="checkbox"
                  defaultChecked={document.isHighlighted}
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

            <Button type="submit" className="w-fit">
              {m.board_documents_edit_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

async function parseMultipartForm(request: Request) {
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
  }

  const form = await parseFormData(request, { maxFileSize: MAX_FILE_SIZE_BYTES }, uploadHandler)
  const file = uploadedFile ?? (form.get('document') as File | null)
  const hasNewFile = file != null && file.size > 0

  return { form, file: hasNewFile ? file : null }
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])
  const canManageBoard = can(Role.BoardValidator)

  let formResult: Awaited<ReturnType<typeof parseMultipartForm>>
  try {
    formResult = await parseMultipartForm(request)
  } catch (error) {
    if (error instanceof MaxFileSizeExceededError) {
      session.flash('error', m.board_documents_invalid_file())
      return redirect(`/board/documents/${params.documentId}/edit`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }
    throw error
  }

  const { form, file } = formResult
  const title = String(form.get('title'))
  const sectionId = Number(form.get('sectionId'))
  const visibleFrom = new Date(String(form.get('visible-from')))
  const visibleUntil = new Date(String(form.get('visible-until')))
  const isHighlighted = form.get('hightlighted') === 'on'

  if (title.length < 1) {
    session.flash('error', m.common_empty_fields_error())
    throw redirect(`/board/document/${params.documentId}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  const parsedFrom = visibleFrom.getTime() > 0 ? visibleFrom : null
  const parsedUntil = visibleUntil.getTime() > 0 ? visibleUntil : null
  if (!validateVisibilityDates(parsedFrom, parsedUntil)) {
    session.flash('error', m.board_documents_date_range_error())
    return redirect(`/board/documents/${params.documentId}/edit`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const resolvedVisibleFrom = visibleFrom.getTime() > 0 ? visibleFrom : canManageBoard ? null : undefined
  const resolvedVisibleUntil = visibleUntil.getTime() > 0 ? visibleUntil : canManageBoard ? null : undefined

  return withScope(congregationId, async db => {
    const documentId = requireParamId(params.documentId, '/board')

    // Handle file replacement if a new file was uploaded
    if (file) {
      const result = await replaceDocumentFile(db, documentId, congregationId, currentUser.id, file)
      if (!result.replaced) {
        logger.warn(`Document edit failed. User ID: ${currentUser.id}. File validation: ${result.error.messageKey}.`)
        session.flash('error', m.board_documents_invalid_file())
        return redirect(`/board/documents/${params.documentId}/edit`, {
          headers: { 'Set-Cookie': await commitSession(session) },
        })
      }
    }

    const document = await updateBoardDocument(db, documentId, congregationId, {
      title: String(title),
      sectionId,
      visibleFrom: resolvedVisibleFrom,
      visibleUntil: resolvedVisibleUntil,
      isHighlighted,
    })

    if (document == null) {
      session.flash('error', m.common_generic_error())

      return redirect(`/board/document/${params.documentId}/edit`, {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    session.flash('success', m.board_documents_edit_success({ name: document.title }))

    return redirect(`/board/documents/${document.id}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
