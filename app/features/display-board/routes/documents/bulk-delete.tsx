import { redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { deleteFile } from '~/features/display-board/server/document'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/bulk-delete'

type BulkItem = { kind: 'pdf' | 'dyn'; id: number }

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request }: Route.ActionArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])

  if (!can(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { items } = (await request.json()) as { items: BulkItem[] }

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false }
  }

  const pdfIds = items.filter(i => i.kind === 'pdf').map(i => i.id)
  const dynIds = items.filter(i => i.kind === 'dyn').map(i => i.id)

  return withScope(congregationId, async db => {
    let pdfDeleted = 0
    if (pdfIds.length > 0) {
      const documents = await db.boardDocument.findMany({
        where: { id: { in: pdfIds }, congregationId },
        select: { uri: true, thumbnailUri: true },
      })

      await db.boardDocument.deleteMany({
        where: { id: { in: pdfIds }, congregationId },
      })

      for (const doc of documents) {
        await deleteFile(doc)
        if (doc.thumbnailUri) {
          await deleteFile({ uri: doc.thumbnailUri })
        }
      }

      pdfDeleted = documents.length
    }

    let dynDeleted = 0
    if (dynIds.length > 0) {
      const result = await db.boardDynamicDocumentSettings.deleteMany({
        where: { id: { in: dynIds }, congregationId },
      })
      dynDeleted = result.count
    }

    logger.info(`Bulk deleted ${pdfDeleted} PDF documents and ${dynDeleted} dynamic documents.`)

    return { ok: true, pdfDeleted, dynDeleted }
  })
}
