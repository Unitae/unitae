import { redirect } from 'react-router'
import { reorderBoardItems } from '~/features/display-board/server/board-document.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/reorder'

type OrderedItem = { kind: 'pdf' | 'dyn'; id: number }

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { orderedItems } = (await request.json()) as { orderedItems: OrderedItem[] }

  if (!Array.isArray(orderedItems) || orderedItems.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    await reorderBoardItems(db, congregationId, orderedItems)

    return { ok: true }
  })
}
