import { redirect } from 'react-router'
import { setBoardItemsHighlighted } from '~/features/display-board/server/board-highlight.server'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/bulk-highlight'

type BulkItem = { kind: 'pdf' | 'dyn'; id: number }

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

/**
 * « Mettre à la une » / « Retirer de la une », for one document or a selection. It is a field of
 * the document, so it takes the right its edit form checks: review for a PDF, managing dynamic
 * documents for a dynamic one.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (
    !permissions.has(Permission.CanReviewBoardDocuments) &&
    !permissions.has(Permission.CanManageDynamicBoardDocuments)
  ) {
    throw redirect('/')
  }

  const { items, highlighted } = (await request.json()) as { items: BulkItem[]; highlighted: boolean }
  if (!Array.isArray(items) || items.length === 0 || typeof highlighted !== 'boolean') {
    return { ok: false }
  }

  const pdfIds = items.filter(i => i.kind === 'pdf').map(i => Number(i.id))
  const dynIds = items.filter(i => i.kind === 'dyn').map(i => Number(i.id))
  if (pdfIds.length > 0) requirePermission(permissions, Permission.CanReviewBoardDocuments)
  if (dynIds.length > 0) requirePermission(permissions, Permission.CanManageDynamicBoardDocuments)

  return withScopeFromContext(context, async db => {
    const { congregationId, id: actorId } = context.get(currentAccountContext)
    const changed = await setBoardItemsHighlighted(db, { congregationId, actorId, pdfIds, dynIds, highlighted })
    return { ok: true, ...changed }
  })
}
