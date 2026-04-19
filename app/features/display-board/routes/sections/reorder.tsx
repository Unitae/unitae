import { redirect } from 'react-router'
import { reorderBoardSections } from '~/features/display-board/server/board-section.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/reorder'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/sections')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { orderedIds } = (await request.json()) as { orderedIds: number[] }

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    await reorderBoardSections(db, congregationId, orderedIds)

    return { ok: true }
  })
}
