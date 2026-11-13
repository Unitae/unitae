import { parseWithZod } from '@conform-to/zod/v4'
import { MoreHorizontal } from 'lucide-react'
import { useCallback, useState } from 'react'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { sectionSchema } from '~/features/display-board/schemas/board-section.schema'
import { updateBoardSection } from '~/features/display-board/server/board-section.server'
import { loadSectionForm } from '~/features/display-board/server/section-form.queries'
import { setSectionVisibilityRoles } from '~/features/display-board/server/section-visibility.server'
import { SectionForm } from '~/features/display-board/ui/forms/SectionForm'
import { DeleteSectionDialog } from '~/features/display-board/ui/manage/DeleteSectionDialog'
import * as m from '~/i18n/paraglide/messages'
import {
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
  { title: `${loaderData?.section?.name ?? m.board_sections_edit_meta_title()} - Unitae` },
]

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanConfigureBoardSections)
  return withScopeFromContext(context, async db => {
    const { congregationId, id: userId } = context.get(currentAccountContext)
    const sectionId = requireParamId(params.sectionId, '/board/documents')
    const form = await loadSectionForm(db, { congregationId, userId, sectionId })
    if (form?.section == null) throw redirect('/board/documents')
    return { ...form, section: form.section }
  })
}

export default function EditSectionPage({ loaderData, actionData }: Route.ComponentProps) {
  const { section, roles, readerRoles, viewerRoleIds } = loaderData
  const { blocker, setDirty } = useUnsavedChanges()
  const onDirtyChange = useCallback((dirty: boolean) => setDirty(dirty), [setDirty])
  const [version, setVersion] = useState(0)
  const [deleting, setDeleting] = useState(false)

  return (
    <>
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={section.name}
        breadcrumbs={[
          { label: m.board_page_title(), to: '/board' },
          { label: m.sidebar_board_manage(), to: '/board/documents' },
          { label: section.name },
        ]}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={m.board_manage_section_more({ name: section.name })}>
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                  {m.board_sections_delete_button()}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DeleteSectionDialog section={deleting ? section : null} onClose={() => setDeleting(false)} />
          </>
        }
      />
      <SectionForm
        key={`${version}-${section.name}-${section.roleIds.join(',')}`}
        defaults={{ name: section.name, roleIds: section.roleIds }}
        roles={roles}
        readerRoles={readerRoles}
        viewerRoleIds={viewerRoleIds}
        lastResult={actionData}
        onCancel={() => setVersion(v => v + 1)}
        onDirtyChange={onDirtyChange}
      />
    </>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanConfigureBoardSections)
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: sectionSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })
  const { name, visibilityRoleIds } = submission.value

  return withScopeFromContext(context, async db => {
    const { congregationId, id: actorId } = context.get(currentAccountContext)
    const sectionId = requireParamId(params.sectionId, '/board/documents')
    const section = await updateBoardSection(db, sectionId, congregationId, actorId, { name })
    if (section == null) throw redirect('/board/documents')
    await setSectionVisibilityRoles(db, section.id, visibilityRoleIds, congregationId, actorId)
    session.flash('success', m.board_sections_edit_success({ name: section.name }))
    return redirect(`/board/sections/${section.id}/edit`, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
