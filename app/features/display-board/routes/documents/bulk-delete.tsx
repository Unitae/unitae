import { redirect } from 'react-router'
import { deleteFile } from '~/features/display-board/server/document.server'
import logger from '~/shared/infra/logger.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/bulk-delete'

type BulkItem = { kind: 'pdf' | 'dyn'; id: number }

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { items } = (await request.json()) as { items: BulkItem[] }

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false }
  }

  const pdfIds = items.filter(i => i.kind === 'pdf').map(i => i.id)
  const dynIds = items.filter(i => i.kind === 'dyn').map(i => i.id)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
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
