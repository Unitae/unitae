import { Status, type StatusTone } from '@unitae/ui'
import { Eye, MoreHorizontal } from 'lucide-react'
import { useCallback, useState } from 'react'
import { data, Link, redirect, useSearchParams } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { type DisplayState, displayState } from '~/features/display-board/model/display-state'
import { fromDisplayWindow, toDisplayWindow } from '~/features/display-board/model/display-window'
import { isDocumentOwnedByUploader, updateBoardDocument } from '~/features/display-board/server/board-document.server'
import { readPdfForm } from '~/features/display-board/server/board-upload.server'
import { replaceDocumentFile } from '~/features/display-board/server/document.server'
import {
  findDisplayStart,
  isSectionOfCongregation,
  loadPdfForm,
} from '~/features/display-board/server/document-form.queries'
import { PdfDocumentForm } from '~/features/display-board/ui/forms/PdfDocumentForm'
import { VersionsPanel } from '~/features/display-board/ui/forms/VersionsPanel'
import { stateText } from '~/features/display-board/ui/manage/StateLabel'
import { notify } from '~/features/notifications/index.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `${loaderData?.document.title ?? m.board_documents_edit_meta_title()} - Unitae` },
]

const TONE: Record<DisplayState['kind'], StatusTone> = {
  shown: 'success',
  scheduled: 'warning',
  expired: 'danger',
  unpublished: 'neutral',
}

/** A reviewer edits any PDF; an uploader only the ones they uploaded. */
async function requireEditable(db: TransactionClient, context: Route.LoaderArgs['context'], documentId: number) {
  const permissions = context.get(permissionsContext)
  const canReview = permissions.has(Permission.CanReviewBoardDocuments)
  const canUpload = permissions.has(Permission.CanUploadBoardDocuments)
  if (!canReview && !canUpload) throw redirect('/')
  const owns = canUpload && (await isDocumentOwnedByUploader(db, documentId, context.get(currentAccountContext).id))
  if (!canReview && !owns) throw redirect('/board/documents')
  return { canReview }
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanReviewBoardDocuments) && !permissions.has(Permission.CanUploadBoardDocuments)) {
    throw redirect('/')
  }
  const documentId = requireParamId(params.documentId, '/board/documents')
  const { timezone } = context.get(congregationContext)

  return withScopeFromContext(context, async db => {
    const { canReview } = await requireEditable(db, context, documentId)
    const now = new Date()
    const form = await loadPdfForm(db, {
      documentId,
      congregationId: context.get(currentAccountContext).congregationId,
      now,
    })
    if (form == null) throw redirect('/board/documents')
    const window = fromDisplayWindow(form.document, { timeZone: timezone, now })
    return { ...form, canReview, timeZone: timezone, now, window }
  })
}

export default function EditDocumentPage({ loaderData, actionData }: Route.ComponentProps) {
  const { document, sections, versions, reads, highlightedOthers, card, canReview, timeZone, now, window } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const { blocker, setDirty } = useUnsavedChanges()
  const onDirtyChange = useCallback((dirty: boolean) => setDirty(dirty), [setDirty])
  const [version, setVersion] = useState(0)
  const state = displayState({ ...document, now: new Date(now) })
  const section = sections.find(s => s.id === document.sectionId)?.name ?? ''
  const historyTo = '?historique'
  const closeHistory = () =>
    setSearchParams(
      prev => {
        prev.delete('historique')
        return prev
      },
      { preventScrollReset: true },
    )
  // What was loaded: a save that changes it starts the form again from it.
  const loaded = [
    document.title,
    document.sectionId,
    document.visibleFrom,
    document.visibleUntil,
    document.isHighlighted,
  ]

  return (
    <>
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={document.title}
        meta={
          <Status tone={TONE[state.kind]} className="text-foreground">
            {stateText(state, timeZone)} · {m.board_form_in_section({ section })}
          </Status>
        }
        breadcrumbs={[
          { label: m.board_page_title(), to: '/board' },
          { label: m.sidebar_board_manage(), to: '/board/documents' },
          { label: document.title },
        ]}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/board/documents/${document.id}/viewer`}>
                <Eye className="size-4" aria-hidden="true" />
                {m.board_form_view_on_board()}
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={m.board_form_more()}>
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to={historyTo} preventScrollReset>
                    {m.board_form_file_history()}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-destructive">
                  <Link to={`/board/documents/${document.id}/delete`}>{m.board_manage_delete()}</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <PdfDocumentForm
        key={`${version}-${loaded.map(String).join('|')}`}
        current={{ card, versions: Math.max(versions.length, 1), historyTo }}
        defaults={{ title: document.title, sectionId: document.sectionId, window, highlighted: document.isHighlighted }}
        sections={sections}
        canReview={canReview}
        highlightedOthers={highlightedOthers}
        card={card}
        facts={{
          reads,
          readsTo: canReview ? `/board/documents?lectures=pdf-${document.id}` : null,
          versions: Math.max(versions.length, 1),
          historyTo,
          createdAt: document.createdAt,
        }}
        lastResult={actionData}
        timeZone={timeZone}
        panel={
          searchParams.has('historique') ? (
            <VersionsPanel documentId={document.id} versions={versions} timeZone={timeZone} onClose={closeHistory} />
          ) : undefined
        }
        onCancel={() => setVersion(v => v + 1)}
        onDirtyChange={onDirtyChange}
      />
    </>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const canReview = permissions.has(Permission.CanReviewBoardDocuments)
  if (!canReview && !permissions.has(Permission.CanUploadBoardDocuments)) throw redirect('/')
  const documentId = requireParamId(params.documentId, '/board/documents')
  const { timezone } = context.get(congregationContext)
  const currentUser = context.get(currentAccountContext)
  const { congregationId } = currentUser
  const session = await getSession(request.headers.get('Cookie'))

  // Read before the transaction: a large upload never holds it open.
  const form = await readPdfForm(request, { canReview })
  if (!form.ok) return data(form.reply, { status: 400 })

  return withScopeFromContext(context, async db => {
    await requireEditable(db, context, documentId)
    const existing = await findDisplayStart(db, documentId, congregationId)
    if (existing == null) throw redirect('/board/documents')
    if (!(await isSectionOfCongregation(db, form.sectionId, congregationId))) {
      return data(form.fail('invalid-section'), { status: 400 })
    }
    // An uploader's edit never touches when it shows: undefined leaves those columns as they are.
    const resolved = form.display
      ? toDisplayWindow(form.display, { timeZone: timezone, now: new Date(), current: existing.visibleFrom })
      : null
    if (resolved && !resolved.ok) return data(form.fail(resolved.error), { status: 400 })

    if (form.file) {
      const replaced = await replaceDocumentFile(db, documentId, congregationId, currentUser.id, form.file)
      if (!replaced.replaced) return data(form.fail('invalid-file'), { status: 400 })
    }
    const document = await updateBoardDocument(db, documentId, congregationId, currentUser.id, {
      title: form.title,
      sectionId: form.sectionId,
      visibleFrom: resolved?.window.visibleFrom,
      visibleUntil: resolved?.window.visibleUntil,
      isHighlighted: form.display?.highlighted,
    })
    if (document == null) throw redirect('/board/documents')

    if (!canReview) {
      await notify(db, {
        type: 'board.document.updated',
        entityType: 'BoardDocument',
        entityId: document.id,
        congregationId,
        actorId: currentUser.id,
        payload: { title: document.title, documentId: document.id },
      })
    }
    session.flash('success', m.board_documents_edit_success({ name: document.title }))
    return redirect(`/board/documents/${document.id}/edit`, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
