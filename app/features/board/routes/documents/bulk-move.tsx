import { redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/bulk-move'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request }: Route.ActionArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])

  if (!can(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { ids, sectionId } = (await request.json()) as { ids: number[]; sectionId: number }

  if (!Array.isArray(ids) || ids.length === 0 || !sectionId) {
    return { ok: false }
  }

  return withScope(congregationId, async db => {
    const result = await db.boardDocument.updateMany({
      where: { id: { in: ids }, congregationId },
      data: { sectionId },
    })

    logger.info(`Bulk moved ${result.count} board documents to section ${sectionId}.`)

    return { ok: true, moved: result.count }
  })
}
