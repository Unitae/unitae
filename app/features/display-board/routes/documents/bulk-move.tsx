import { redirect } from 'react-router'
import { bulkMoveBoardItems } from '~/features/display-board/server/board-document.server'
import logger from '~/shared/infra/logger.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/bulk-move'

type BulkItem = { kind: 'pdf' | 'dyn'; id: number }

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { items, sectionId } = (await request.json()) as { items: BulkItem[]; sectionId: number }

  if (!Array.isArray(items) || items.length === 0 || !sectionId) {
    return { ok: false }
  }

  const pdfIds = items.filter(i => i.kind === 'pdf').map(i => i.id)
  const dynIds = items.filter(i => i.kind === 'dyn').map(i => i.id)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const { pdfMoved, dynMoved } = await bulkMoveBoardItems(db, congregationId, sectionId, pdfIds, dynIds)

    logger.info(`Bulk moved ${pdfMoved} PDFs and ${dynMoved} dynamic docs to section ${sectionId}.`)

    return { ok: true, pdfMoved, dynMoved }
  })
}
