import { redirect } from 'react-router'
import { reorderBoardItems } from '~/features/display-board/server/board-document.server'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/reorder'

type OrderedItem = { kind: 'pdf' | 'dyn'; id: number }

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanOrganiseBoardDocuments)

  const { orderedItems } = (await request.json()) as { orderedItems: OrderedItem[] }

  if (!Array.isArray(orderedItems) || orderedItems.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    await reorderBoardItems(db, congregationId, orderedItems)

    return { ok: true }
  })
}
