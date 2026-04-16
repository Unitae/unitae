import { redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/bulk-move'

type BulkItem = { kind: 'pdf' | 'dyn'; id: number }

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request }: Route.ActionArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])

  if (!can(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { items, sectionId } = (await request.json()) as { items: BulkItem[]; sectionId: number }

  if (!Array.isArray(items) || items.length === 0 || !sectionId) {
    return { ok: false }
  }

  const pdfIds = items.filter(i => i.kind === 'pdf').map(i => i.id)
  const dynIds = items.filter(i => i.kind === 'dyn').map(i => i.id)

  return withScope(congregationId, async db => {
    let pdfMoved = 0
    if (pdfIds.length > 0) {
      const result = await db.boardDocument.updateMany({
        where: { id: { in: pdfIds }, congregationId },
        data: { sectionId },
      })
      pdfMoved = result.count
    }

    let dynMoved = 0
    if (dynIds.length > 0) {
      const result = await db.boardDynamicDocumentSettings.updateMany({
        where: { id: { in: dynIds }, congregationId },
        data: { sectionId },
      })
      dynMoved = result.count
    }

    logger.info(`Bulk moved ${pdfMoved} PDFs and ${dynMoved} dynamic docs to section ${sectionId}.`)

    return { ok: true, pdfMoved, dynMoved }
  })
}
