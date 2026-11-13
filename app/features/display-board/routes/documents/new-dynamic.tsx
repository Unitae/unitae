import { parseWithZod } from '@conform-to/zod/v4'
import { Calendar, ChevronRight, Network, Star, Users } from 'lucide-react'
import { useCallback } from 'react'
import { data, Link, redirect } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { fromDisplayWindow, toDisplayWindow } from '~/features/display-board/model/display-window'
import { DynamicType, isDynamicType } from '~/features/display-board/model/dynamic-document.type'
import { newDynamicDocumentSchema } from '~/features/display-board/schemas/board-document.schema'
import { createDynamicDocument } from '~/features/display-board/server/board-document.server'
import { isSectionOfCongregation } from '~/features/display-board/server/document-form.queries'
import { listDynamicChoices, loadDynamicForm } from '~/features/display-board/server/dynamic-form.queries'
import { BOARD_WEB_FONTS_HREF } from '~/features/display-board/ui/dynamic/board-web-fonts'
import { DynamicDocumentForm } from '~/features/display-board/ui/forms/DynamicDocumentForm'
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
import { EmptyState } from '~/shared/ui/EmptyState'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import type { Route } from './+types/new-dynamic'

export const meta: Route.MetaFunction = () => [{ title: `${m.board_new_dynamic_title()} - Unitae` }]

export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: BOARD_WEB_FONTS_HREF }]

const TYPES: Record<DynamicType, { icon: typeof Users; title: () => string; description: () => string }> = {
  [DynamicType.Organigram]: {
    icon: Network,
    title: m.board_dynamic_type_organigram,
    description: m.board_dynamic_type_organigram_description,
  },
  [DynamicType.PublisherGroups]: {
    icon: Users,
    title: m.board_dynamic_type_groups,
    description: m.board_dynamic_type_groups_description,
  },
  [DynamicType.Pioneers]: {
    icon: Star,
    title: m.board_dynamic_type_pioneers,
    description: m.board_dynamic_type_pioneers_description,
  },
  [DynamicType.Programme]: {
    icon: Calendar,
    title: m.board_dynamic_type_programme,
    description: m.board_dynamic_type_programme_description,
  },
}

const keyOf = (type: string, ref: string | null) => `${type}|${ref ?? ''}`

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageDynamicBoardDocuments)
  const params = new URL(request.url).searchParams
  const type = params.get('type')
  const ref = params.get('ref') || null
  const { timezone, displayName } = context.get(congregationContext)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const choices = await listDynamicChoices(db, congregationId)
    const chosen = choices.available.find(c => c.dynamicType === type && c.dynamicRef === ref)
    // A type shown once leads to its document; a programme can be added as many times as needed.
    if (chosen == null || !choices.hasSection) return { step: 'choose' as const, ...choices }
    const existingId = choices.existing[keyOf(chosen.dynamicType, chosen.dynamicRef)]
    if (chosen.alreadyAdded && existingId) throw redirect(`/board/dynamic/${existingId}/edit`)

    const now = new Date()
    const form = await loadDynamicForm(db, {
      congregationId,
      now,
      document: { type: chosen.dynamicType, ref: chosen.dynamicRef, title: TYPES[chosen.dynamicType].title() },
    })
    if (form == null) return { step: 'choose' as const, ...choices }
    const window = fromDisplayWindow(form.document, { timeZone: timezone, now })
    return { step: 'form' as const, ...form, window, now, timeZone: timezone, congregationName: displayName }
  })
}

function TypeChoices({ loaderData }: { loaderData: Extract<Route.ComponentProps['loaderData'], { step: 'choose' }> }) {
  const { available, hasSection, existing } = loaderData
  if (!hasSection) {
    return (
      <EmptyState
        icon={Users}
        title={m.board_empty_manager_title()}
        description={m.board_new_dynamic_requires_section()}
        action={
          <Button asChild>
            <Link to="/board/sections/new">{m.board_empty_manager_action()}</Link>
          </Button>
        }
      />
    )
  }
  if (available.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={m.board_new_dynamic_empty_title()}
        description={m.board_new_dynamic_empty_description()}
      />
    )
  }
  return (
    <ul className="flex max-w-3xl flex-col rounded-lg border border-border bg-surface">
      {available.map(choice => {
        const { icon: Icon, title, description } = TYPES[choice.dynamicType]
        const existingId = existing[keyOf(choice.dynamicType, choice.dynamicRef)]
        const added = choice.alreadyAdded && existingId != null
        const to = added
          ? `/board/dynamic/${existingId}/edit`
          : `?${new URLSearchParams({ type: choice.dynamicType, ...(choice.dynamicRef ? { ref: choice.dynamicRef } : {}) })}`
        return (
          <li key={keyOf(choice.dynamicType, choice.dynamicRef)} className="border-border border-b last:border-b-0">
            <Link to={to} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-hover">
              <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{title()}</span>
                <span className="text-muted-foreground text-sm">{description()}</span>
              </span>
              <span className="shrink-0 text-faint text-sm">
                {added ? m.board_new_dynamic_already_open() : m.board_new_dynamic_add_button()}
              </span>
              <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden="true" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export default function NewDynamicDocumentPage({ loaderData, actionData }: Route.ComponentProps) {
  const { blocker, setDirty } = useUnsavedChanges()
  const onDirtyChange = useCallback((dirty: boolean) => setDirty(dirty), [setDirty])
  const trail = [
    { label: m.board_page_title(), to: '/board' },
    { label: m.sidebar_board_manage(), to: '/board/documents' },
  ]

  if (loaderData.step === 'choose') {
    return (
      <>
        <PageHeader
          title={m.board_new_dynamic_title()}
          subtitle={m.board_new_dynamic_subtitle()}
          breadcrumbs={[...trail, { label: m.board_new_dynamic_title() }]}
        />
        <TypeChoices loaderData={loaderData} />
      </>
    )
  }

  const { document, appearance, sections, templates, highlightedOthers, data: preview, window } = loaderData
  return (
    <>
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={TYPES[document.type].title()}
        breadcrumbs={[
          ...trail,
          { label: m.board_new_dynamic_title(), to: '/board/documents/new-dynamic' },
          { label: TYPES[document.type].title() },
        ]}
      />
      <DynamicDocumentForm
        id={null}
        type={document.type}
        dynamicRef={document.ref}
        defaults={{
          title: document.title,
          sectionId: document.sectionId,
          window,
          highlighted: false,
          dynamicConfig: document.dynamicConfig,
        }}
        appearance={appearance}
        sections={sections}
        templates={templates}
        highlightedOthers={highlightedOthers}
        data={preview}
        congregationName={loaderData.congregationName}
        now={loaderData.now}
        timeZone={loaderData.timeZone}
        lastResult={actionData}
        onDirtyChange={onDirtyChange}
      />
    </>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageDynamicBoardDocuments)
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: newDynamicDocumentSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })
  const { dynamicType, title, sectionId, appearance, show, from, until, highlighted } = submission.value
  const dynamicRef = submission.value.dynamicRef || null
  const { timezone } = context.get(congregationContext)

  const resolved = toDisplayWindow({ show, from, until }, { timeZone: timezone, now: new Date() })
  if (!resolved.ok) {
    const field = resolved.error === 'missing-from' ? 'from' : 'until'
    const message =
      resolved.error === 'missing-from' ? m.board_form_error_missing_from() : m.board_form_error_until_before_from()
    return data(submission.reply({ fieldErrors: { [field]: [message] } }), { status: 400 })
  }

  return withScopeFromContext(context, async db => {
    const { congregationId, id: actorId } = context.get(currentAccountContext)
    // Only a type this congregation can show, and not a second of one shown once.
    const choices = await listDynamicChoices(db, congregationId)
    const chosen = choices.available.find(c => c.dynamicType === dynamicType && c.dynamicRef === dynamicRef)
    if (chosen == null || chosen.alreadyAdded || !isDynamicType(dynamicType))
      throw redirect('/board/documents/new-dynamic')

    if (!(await isSectionOfCongregation(db, sectionId, congregationId))) {
      return data(submission.reply({ fieldErrors: { sectionId: [m.board_form_section_invalid()] } }), { status: 400 })
    }

    let dynamicConfig: Prisma.InputJsonValue | undefined
    try {
      dynamicConfig = submission.value.dynamicConfig ? JSON.parse(submission.value.dynamicConfig) : undefined
    } catch {
      dynamicConfig = undefined
    }
    const created = await createDynamicDocument(db, {
      title,
      dynamicType,
      dynamicRef,
      dynamicConfig,
      sectionId,
      congregationId,
      actorId,
      visibleFrom: resolved.window.visibleFrom,
      visibleUntil: resolved.window.visibleUntil,
      isHighlighted: highlighted === 'on',
      appearance,
    })
    session.flash('success', m.board_new_dynamic_added({ name: created.title }))
    return redirect('/board/documents', { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
