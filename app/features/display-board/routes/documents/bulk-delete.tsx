import { redirect } from 'react-router'
import { bulkDeleteBoardItems } from '~/features/display-board/server/board-document.server'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/bulk-delete'

type BulkItem = { kind: 'pdf' | 'dyn'; id: number }

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.BoardValidator)

  const { items } = (await request.json()) as { items: BulkItem[] }

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false }
  }

  const pdfIds = items.filter(i => i.kind === 'pdf').map(i => i.id)
  const dynIds = items.filter(i => i.kind === 'dyn').map(i => i.id)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const { pdfDeleted, dynDeleted } = await bulkDeleteBoardItems(db, congregationId, pdfIds, dynIds)

    logger.info(`Bulk deleted ${pdfDeleted} PDF documents and ${dynDeleted} dynamic documents.`)

    return { ok: true, pdfDeleted, dynDeleted }
  })
}
