import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { deleteBoardSection, loadSectionDeletion } from '~/features/display-board/server/board-section-delete.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

// Deleting is a dialog (`DeleteSectionDialog`), which asks here, with `?preview`, what the section holds. Any other
// visit to this address goes back to the board's list.
export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanConfigureBoardSections)
  if (!new URL(request.url).searchParams.has('preview')) throw redirect('/board/documents')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const deletion = await loadSectionDeletion(db, requireParamId(params.sectionId, '/board/documents'), congregationId)
    if (deletion == null) throw redirect('/board/documents')
    return deletion
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanConfigureBoardSections)
  const session = await getSession(request.headers.get('Cookie'))
  const form = await request.formData()
  // Its documents move unless deleting them was chosen; an empty section posts no choice.
  const moveTo = form.get('contents') === 'move' ? Number(form.get('moveTo')) : null

  return withScopeFromContext(context, async db => {
    const { congregationId, id: actorId } = context.get(currentAccountContext)
    const sectionId = requireParamId(params.sectionId, '/board/documents')
    const result = await deleteBoardSection(db, { sectionId, congregationId, actorId, moveTo })
    if (result == null) {
      session.flash('error', m.common_generic_error())
    } else if (result.moved > 0) {
      session.flash('success', m.board_section_delete_success_moved({ name: result.name, count: result.moved }))
    } else {
      session.flash('success', m.board_sections_delete_success({ name: result.name }))
    }
    return redirect('/board/documents', { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
