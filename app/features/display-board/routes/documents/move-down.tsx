import { redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { reorderDocument } from '~/features/display-board/server/document.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/move-down'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])
  const canManageBoard = can(Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
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
