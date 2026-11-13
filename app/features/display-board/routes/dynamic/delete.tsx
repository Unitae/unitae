import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { deleteDynamicDocument } from '~/features/display-board/server/board-document.server'
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

// Deleting is a dialog on the board's list and the edit page; an old link to this address lands on the viewer.
export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/board/dynamic/${params.dynamicId}/viewer`)
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageDynamicBoardDocuments)

  const session = await getSession(request.headers.get('Cookie'))
  const dynamicId = requireParamId(params.dynamicId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const settings = await deleteDynamicDocument(db, dynamicId, congregationId)

    session.flash('success', m.board_dynamic_delete_success({ name: settings.title }))

    return redirect('/board/documents', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
