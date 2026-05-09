import { parseWithZod } from '@conform-to/zod'
import { type FileUpload, MaxFileSizeExceededError, parseFormData } from '@mjackson/form-data-parser'
import { History, Trash2 } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { updateDocumentSchema } from '~/features/display-board/schemas/board-document.schema'
import { isDocumentOwnedByUploader, updateBoardDocument } from '~/features/display-board/server/board-document.server'
import { replaceDocumentFile } from '~/features/display-board/server/document.server'
import { MAX_FILE_SIZE_BYTES, validateVisibilityDates } from '~/features/display-board/server/file-validation.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.board_documents_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canUploadDocument = permissions.has(Permission.BoardUploader)
  const canManageBoard = permissions.has(Permission.BoardValidator)

  if (!canUploadDocument && !canManageBoard) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const documentId = requireParamId(params.documentId, '/board')
    const document = await db.boardDocument.findUnique({
      where: {
        id_congregationId: { id: documentId, congregationId: currentUser.congregationId },
      },
    })

    if (document == null) throw redirect('/board/documents')

    const ownsDocument = canUploadDocument && (await isDocumentOwnedByUploader(db, documentId, currentUser.id))
    if (!canManageBoard && !ownsDocument) throw redirect('/board/documents')

    const sections = await db.boardSection.findMany({ where: { congregationId: currentUser.congregationId } })

    return { document, sections, canManageBoard }
  })
}

export default function EditDocumentPage({ loaderData }: Route.ComponentProps) {
  const { document, sections, canManageBoard } = loaderData

  const { blocker, markDirty } = useUnsavedChanges()

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
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.board_documents_edit_title()}
        subtitle={m.board_documents_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_documents(), to: '/board/documents' },
          { label: m.board_documents_edit_title() },
        ]}
        backTo="/board/documents"
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
          <Form method="post" className="flex flex-col gap-4" encType="multipart/form-data" onChange={markDirty}>
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
              <Select name="sectionId" defaultValue={String(document.sectionId)}>
                <SelectTrigger id="sectionId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map(section => (
                    <SelectItem key={section.id} value={String(section.id)}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canManageBoard && (
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

            {canManageBoard && (
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

            <SubmitButton className="w-fit">{m.board_documents_edit_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

type ResolvedVisibility = {
  visibleFrom: Date | null | undefined
  visibleUntil: Date | null | undefined
  rangeIsValid: boolean
}

function resolveVisibility(rawFrom: Date, rawUntil: Date, canManageBoard: boolean): ResolvedVisibility {
  if (!canManageBoard) {
    // Uploader edits never touch visibility — undefined skips the column.
    return { visibleFrom: undefined, visibleUntil: undefined, rangeIsValid: true }
  }
  const visibleFrom = rawFrom.getTime() > 0 ? rawFrom : null
  const visibleUntil = rawUntil.getTime() > 0 ? rawUntil : null
  return { visibleFrom, visibleUntil, rangeIsValid: validateVisibilityDates(visibleFrom, visibleUntil) }
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

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canUploadDocument = permissions.has(Permission.BoardUploader)
  const canManageBoard = permissions.has(Permission.BoardValidator)

  if (!canUploadDocument && !canManageBoard) {
    throw redirect('/')
  }

  const session = await getSession(request.headers.get('Cookie'))

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
  const submission = parseWithZod(form, { schema: updateDocumentSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { title, sectionId } = submission.value
  const visibility = resolveVisibility(
    new Date(submission.value['visible-from']),
    new Date(submission.value['visible-until']),
    canManageBoard,
  )

  if (!visibility.rangeIsValid) {
    session.flash('error', m.board_documents_date_range_error())
    return redirect(`/board/documents/${params.documentId}/edit`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  // Highlight is validator-controlled too; uploader edits skip the column.
  const resolvedIsHighlighted = canManageBoard ? submission.value.hightlighted === 'on' : undefined

  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    const documentId = requireParamId(params.documentId, '/board')

    const ownsDocument = canUploadDocument && (await isDocumentOwnedByUploader(db, documentId, currentUser.id))
    if (!canManageBoard && !ownsDocument) throw redirect('/board/documents')

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

    const document = await updateBoardDocument(db, documentId, congregationId, currentUser.id, {
      title: String(title),
      sectionId,
      visibleFrom: visibility.visibleFrom,
      visibleUntil: visibility.visibleUntil,
      isHighlighted: resolvedIsHighlighted,
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
