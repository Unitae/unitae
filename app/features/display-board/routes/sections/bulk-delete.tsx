import { redirect } from 'react-router'
import { Role } from '~/shared/types/role'
import { deleteSectionWithFiles } from '~/features/display-board/server/document.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import logger from '~/shared/infra/logger.server'

import type { Route } from './+types/bulk-delete'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/sections')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { ids } = (await request.json()) as { ids: number[] }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    for (const sectionId of ids) {
      await deleteSectionWithFiles(db, sectionId, congregationId)
    }

    logger.info(`Bulk deleted ${ids.length} board sections.`)

    return { ok: true, deleted: ids.length }
  })
}
