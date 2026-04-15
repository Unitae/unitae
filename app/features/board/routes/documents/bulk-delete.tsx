import { redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { deleteFile } from '~/features/board/server/document'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/bulk-delete'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request }: Route.ActionArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])

  if (!can(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { ids } = (await request.json()) as { ids: number[] }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false }
  }

  return withScope(congregationId, async db => {
    const documents = await db.boardDocument.findMany({
      where: { id: { in: ids }, congregationId },
      select: { uri: true, thumbnailUri: true },
    })

    await db.boardDocument.deleteMany({
      where: { id: { in: ids }, congregationId },
    })

    // Clean up stored files
    for (const doc of documents) {
      await deleteFile(doc)
      if (doc.thumbnailUri) {
        await deleteFile({ uri: doc.thumbnailUri })
      }
    }

    logger.info(`Bulk deleted ${documents.length} board documents.`)

    return { ok: true, deleted: documents.length }
  })
}
