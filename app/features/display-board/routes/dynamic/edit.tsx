import { parseWithZod } from '@conform-to/zod/v4'
import { Status, type StatusTone } from '@unitae/ui'
import { Eye, MoreHorizontal } from 'lucide-react'
import { useCallback, useState } from 'react'
import { data, Link, redirect } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { type DisplayState, displayState } from '~/features/display-board/model/display-state'
import { fromDisplayWindow, toDisplayWindow } from '~/features/display-board/model/display-window'
import { dynamicDocumentSchema } from '~/features/display-board/schemas/board-document.schema'
import { loadDynamicForm } from '~/features/display-board/server/dynamic-form.queries'
import { updateDynamicDocument } from '~/features/display-board/server/update-dynamic-document.server'
import { BOARD_WEB_FONTS_HREF } from '~/features/display-board/ui/dynamic/board-web-fonts'
import { DynamicDocumentForm } from '~/features/display-board/ui/forms/DynamicDocumentForm'
import { DeleteBoardItemDialog } from '~/features/display-board/ui/manage/DeleteBoardItemDialog'
import { stateText } from '~/features/display-board/ui/manage/StateLabel'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `${loaderData?.document.title ?? m.board_dynamic_edit_meta_title()} - Unitae` },
]

// The typeface samples and the preview are set in the board's faces.
export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: BOARD_WEB_FONTS_HREF }]

const TONE: Record<DisplayState['kind'], StatusTone> = {
  shown: 'success',
  scheduled: 'warning',
  expired: 'danger',
  unpublished: 'neutral',
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageDynamicBoardDocuments)
  const dynamicId = requireParamId(params.dynamicId, '/board/documents')
  const { timezone, displayName } = context.get(congregationContext)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const now = new Date()
    const form = await loadDynamicForm(db, { congregationId, now, document: { id: dynamicId } })
    if (form == null) throw redirect('/board/documents')
    const window = fromDisplayWindow(form.document, { timeZone: timezone, now })
    return { ...form, window, now, timeZone: timezone, congregationName: displayName }
  })
}

export default function EditDynamicDocumentPage({ loaderData, actionData }: Route.ComponentProps) {
  const { document, appearance, sections, templates, highlightedOthers, data: preview, window } = loaderData
  const { blocker, setDirty } = useUnsavedChanges()
  const onDirtyChange = useCallback((dirty: boolean) => setDirty(dirty), [setDirty])
  const [version, setVersion] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const id = document.id ?? 0
  const state = displayState({ ...document, now: new Date(loaderData.now) })
  const section = sections.find(s => s.id === document.sectionId)?.name ?? ''
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
            {stateText(state, loaderData.timeZone)} · {m.board_form_in_section({ section })}
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
              <Link to={`/board/dynamic/${id}/viewer`}>
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
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                  {m.board_manage_delete()}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DeleteBoardItemDialog
              item={deleting ? { kind: 'dynamic', id, title: document.title } : null}
              onClose={() => setDeleting(false)}
            />
          </>
        }
      />
      <DynamicDocumentForm
        key={`${version}-${loaded.map(String).join('|')}`}
        id={id}
        type={document.type}
        dynamicRef={document.ref}
        defaults={{
          title: document.title,
          sectionId: document.sectionId,
          window,
          highlighted: document.isHighlighted,
          dynamicConfig: document.dynamicConfig,
        }}
        appearance={appearance}
        sections={sections}
        templates={templates}
        highlightedOthers={highlightedOthers}
        data={preview}
        now={loaderData.now}
        timeZone={loaderData.timeZone}
        congregationName={loaderData.congregationName}
        lastResult={actionData}
        onCancel={() => setVersion(v => v + 1)}
        onDirtyChange={onDirtyChange}
      />
    </>
  )
}

/** A programme's content, posted as JSON; anything unreadable keeps the stored one. */
function readConfig(raw: string | undefined): Prisma.InputJsonValue | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageDynamicBoardDocuments)
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: dynamicDocumentSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })
  const { title, sectionId, appearance, show, from, until, highlighted } = submission.value
  const dynamicId = requireParamId(params.dynamicId, '/board/documents')
  const { timezone } = context.get(congregationContext)

  return withScopeFromContext(context, async db => {
    const { congregationId, id: actorId } = context.get(currentAccountContext)
    const current = await loadDynamicForm(db, { congregationId, now: new Date(), document: { id: dynamicId } })
    if (current == null) throw redirect('/board/documents')
    // Only one of this congregation's sections: the list the form offered.
    if (!current.sections.some(section => section.id === sectionId)) {
      return data(submission.reply({ fieldErrors: { sectionId: [m.board_form_section_invalid()] } }), { status: 400 })
    }
    const resolved = toDisplayWindow(
      { show, from, until },
      { timeZone: timezone, now: new Date(), current: current.document.visibleFrom },
    )
    if (!resolved.ok) {
      const field = resolved.error === 'missing-from' ? 'from' : 'until'
      const message =
        resolved.error === 'missing-from' ? m.board_form_error_missing_from() : m.board_form_error_until_before_from()
      return data(submission.reply({ fieldErrors: { [field]: [message] } }), { status: 400 })
    }

    const settings = await updateDynamicDocument(db, dynamicId, congregationId, actorId, {
      title,
      sectionId,
      visibleFrom: resolved.window.visibleFrom,
      visibleUntil: resolved.window.visibleUntil,
      isHighlighted: highlighted === 'on',
      // Never in the form: the programme's per-template choice decides; the stored fallback stays.
      showServices: current.document.showServices,
      dynamicConfig: readConfig(submission.value.dynamicConfig),
      appearance,
    })
    if (!settings) throw redirect('/board/documents')
    session.flash('success', m.board_dynamic_edit_success({ name: settings.title }))
    return redirect(`/board/dynamic/${dynamicId}/edit`, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
