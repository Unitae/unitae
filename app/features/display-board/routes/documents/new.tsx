import { FileText } from 'lucide-react'
import { useCallback } from 'react'
import { data, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { fromDisplayWindow, toDisplayWindow } from '~/features/display-board/model/display-window'
import { createBoardDocument } from '~/features/display-board/server/board-document.server'
import type { PdfBoardCard } from '~/features/display-board/server/board-home.queries'
import { readPdfForm } from '~/features/display-board/server/board-upload.server'
import { saveFile } from '~/features/display-board/server/document.server'
import {
  countHighlighted,
  isSectionOfCongregation,
  listSectionChoices,
} from '~/features/display-board/server/document-form.queries'
import { FileValidationError, validateBoardFile } from '~/features/display-board/server/file-validation.server'
import { thumbnailQueue } from '~/features/display-board/server/thumbnail-queue.server'
import { PdfDocumentForm } from '~/features/display-board/ui/forms/PdfDocumentForm'
import { notify } from '~/features/notifications/index.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitService } from '~/shared/domain/limits.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { handleAppError } from '~/shared/utils/handle-app-error.server'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => [{ title: `${m.board_form_new_title()} - Unitae` }]

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanUploadBoardDocuments)) throw redirect('/')
  const canReview = permissions.has(Permission.CanReviewBoardDocuments)
  const { timezone } = context.get(congregationContext)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const now = new Date()
    const [sections, highlightedOthers] = await Promise.all([
      listSectionChoices(db, congregationId),
      countHighlighted(db, congregationId),
    ])
    const window = fromDisplayWindow({ visibleFrom: now, visibleUntil: null }, { timeZone: timezone, now })
    return { sections, highlightedOthers, canReview, timeZone: timezone, now, window }
  })
}

export default function NewDocumentPage({ loaderData, actionData }: Route.ComponentProps) {
  const { sections, highlightedOthers, canReview, timeZone, now, window } = loaderData
  const { blocker, setDirty } = useUnsavedChanges()
  const onDirtyChange = useCallback((dirty: boolean) => setDirty(dirty), [setDirty])
  // The card a new document gets: new, unread, no thumbnail until its file is processed.
  const card: PdfBoardCard = {
    kind: 'pdf',
    id: 0,
    title: '',
    sectionId: sections[0]?.id ?? 0,
    order: null,
    createdAt: new Date(now),
    visibleUntil: null,
    isHighlighted: false,
    hasThumbnail: false,
    replacedAt: null,
    unread: true,
    badge: 'new',
  }

  return (
    <>
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.board_form_new_title()}
        breadcrumbs={[
          { label: m.board_page_title(), to: '/board' },
          { label: m.sidebar_board_manage(), to: '/board/documents' },
          { label: m.board_form_new_title() },
        ]}
      />
      {sections.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={m.board_empty_manager_title()}
          description={m.board_empty_manager_description()}
          action={
            <Button asChild>
              <Link to="/board/sections/new">{m.board_empty_manager_action()}</Link>
            </Button>
          }
        />
      ) : (
        <PdfDocumentForm
          current={null}
          defaults={{ title: '', sectionId: sections[0].id, window, highlighted: false }}
          sections={sections}
          canReview={canReview}
          highlightedOthers={highlightedOthers}
          card={card}
          lastResult={actionData}
          timeZone={timeZone}
          onDirtyChange={onDirtyChange}
        />
      )}
    </>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanUploadBoardDocuments)) throw redirect('/')
  const canReview = permissions.has(Permission.CanReviewBoardDocuments)
  const congregation = context.get(congregationContext)
  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))

  // Read before the transaction: a large upload never holds it open.
  const form = await readPdfForm(request, { canReview })
  if (!form.ok) return data(form.reply, { status: 400 })
  const { file } = form
  if (file == null) return data(form.fail('missing-file'), { status: 400 })
  // An uploader's document waits for a reviewer: no window, so « Non publié ».
  const resolved = form.display
    ? toDisplayWindow(form.display, { timeZone: congregation.timezone, now: new Date() })
    : null
  if (resolved && !resolved.ok) return data(form.fail(resolved.error), { status: 400 })

  const { congregationId } = currentUser
  return withScopeFromContext(context, async db => {
    if (!(await isSectionOfCongregation(db, form.sectionId, congregationId))) {
      return data(form.fail('invalid-section'), { status: 400 })
    }
    try {
      await new LimitService(db, congregation).errorIfWouldGoOverLimit('boardDocuments')
      await validateBoardFile(file)
      const storageKey = await saveFile(congregationId, file)
      const document = await createBoardDocument(db, {
        title: form.title,
        sectionId: form.sectionId,
        uri: storageKey,
        congregationId,
        visibleFrom: resolved?.window.visibleFrom ?? null,
        visibleUntil: resolved?.window.visibleUntil ?? null,
        ...(form.display ? { isHighlighted: form.display.highlighted } : {}),
        actorId: currentUser.id,
      })
      await thumbnailQueue.add('generate-thumbnail', {
        congregationId,
        documentId: document.id,
        pdfStorageKey: storageKey,
      })
      if (!canReview) {
        await notify(db, {
          type: 'board.document.created',
          entityType: 'BoardDocument',
          entityId: document.id,
          congregationId,
          actorId: currentUser.id,
          payload: { title: document.title, documentId: document.id },
        })
      }
      session.flash('success', m.board_documents_new_success({ name: document.title }))
      return redirect(`/board/documents/${document.id}/edit`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    } catch (error) {
      if (error instanceof FileValidationError) return data(form.fail('invalid-file'), { status: 400 })
      await handleAppError(error, session, '/board/documents/new')
    }
  })
}
