import { redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { reorderSection } from '~/features/display-board/server/document.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/move-up'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/sections')
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])
  const canManageBoard = can(Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const sectionId = requireParamId(params.sectionId, '/board')
    const result = await reorderSection(db, sectionId, congregationId, 'up')

    if (result == null) {
      session.flash('error', m.board_sections_move_not_found())
    } else {
      session.flash('success', m.board_sections_move_up_success({ name: result.name }))
    }

    return redirect('/board/sections', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
