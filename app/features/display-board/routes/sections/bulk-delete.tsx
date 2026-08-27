import { redirect } from 'react-router'
import { deleteSectionWithFiles } from '~/features/display-board/server/document.server'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/bulk-delete'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/sections')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanConfigureBoardSections)

  const { ids } = (await request.json()) as { ids: number[] }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    for (const sectionId of ids) {
      await deleteSectionWithFiles(db, sectionId, congregationId)
    }

    logger.info(`Bulk deleted ${ids.length} board sections.`)

    return { ok: true, deleted: ids.length }
  })
}
