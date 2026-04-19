import { redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { deleteSectionWithFiles } from '~/features/display-board/server/document.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/bulk-delete'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/sections')
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
    for (const sectionId of ids) {
      await deleteSectionWithFiles(db, sectionId, congregationId)
    }

    logger.info(`Bulk deleted ${ids.length} board sections.`)

    return { ok: true, deleted: ids.length }
  })
}
