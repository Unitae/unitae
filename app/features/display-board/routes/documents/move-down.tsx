import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { reorderDocument } from '~/features/display-board/server/document.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext, requireRole } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/move-down'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requireRole(permissions, Role.BoardValidator)

  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const documentId = requireParamId(params.documentId, '/board')
    const result = await reorderDocument(db, documentId, congregationId, 'down')

    if (result == null) {
      session.flash('error', m.board_documents_move_not_found())
    } else {
      session.flash('success', m.board_documents_move_down_success({ name: result.title }))
    }

    return redirect('/board/documents', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
