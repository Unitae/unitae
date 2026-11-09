import { parseWithZod } from '@conform-to/zod/v4'
import { useCallback } from 'react'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { sectionSchema } from '~/features/display-board/schemas/board-section.schema'
import { createBoardSection } from '~/features/display-board/server/board-section.server'
import { loadSectionForm } from '~/features/display-board/server/section-form.queries'
import { setSectionVisibilityRoles } from '~/features/display-board/server/section-visibility.server'
import { SectionForm } from '~/features/display-board/ui/forms/SectionForm'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => [{ title: `${m.board_section_form_new_title()} - Unitae` }]

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanConfigureBoardSections)
  return withScopeFromContext(context, async db => {
    const { congregationId, id: userId } = context.get(currentAccountContext)
    const form = await loadSectionForm(db, { congregationId, userId, sectionId: null })
    if (form == null) throw redirect('/board/documents')
    return form
  })
}

export default function NewSectionPage({ loaderData, actionData }: Route.ComponentProps) {
  const { roles, readerRoles, viewerRoleIds } = loaderData
  const { blocker, setDirty } = useUnsavedChanges()
  const onDirtyChange = useCallback((dirty: boolean) => setDirty(dirty), [setDirty])

  return (
    <>
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.board_section_form_new_title()}
        breadcrumbs={[
          { label: m.board_page_title(), to: '/board' },
          { label: m.sidebar_board_manage(), to: '/board/documents' },
          { label: m.board_section_form_new_title() },
        ]}
      />
      <SectionForm
        defaults={null}
        roles={roles}
        readerRoles={readerRoles}
        viewerRoleIds={viewerRoleIds}
        lastResult={actionData}
        onDirtyChange={onDirtyChange}
      />
    </>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanConfigureBoardSections)
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: sectionSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })
  const { name, visibilityRoleIds } = submission.value

  return withScopeFromContext(context, async db => {
    const { congregationId, id: actorId } = context.get(currentAccountContext)
    const section = await createBoardSection(db, { name, congregationId, actorId })
    if (visibilityRoleIds.length > 0) {
      await setSectionVisibilityRoles(db, section.id, visibilityRoleIds, congregationId, actorId)
    }
    session.flash('success', m.board_sections_new_success({ name: section.name }))
    // Back to the board's management, where the new section waits for its documents.
    return redirect('/board/documents', { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
