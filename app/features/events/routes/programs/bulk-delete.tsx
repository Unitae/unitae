import { redirect } from 'react-router'
import { canManageAnyProgram, getResponsibleTemplateIds } from '~/features/events/server/programme-auth.server'
import { bulkDeleteEvents } from '~/features/events/server/programme-events.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/bulk-delete'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const isProgramManager = permissions.has(Permission.ProgramManager)

  const { ids } = (await request.json()) as { ids: number[] }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (p: Permission) => permissions.has(p)
    if (!(await canManageAnyProgram(db, can, currentUser.id, congregationId))) throw redirect('/programs')

    let allowedIds = ids
    if (!isProgramManager) {
      const responsibleTemplateIds = await getResponsibleTemplateIds(db, currentUser.id, congregationId)
      const responsibleSet = new Set(responsibleTemplateIds)
      const events = await db.event.findMany({
        where: { id: { in: ids }, congregationId },
        select: { id: true, templateId: true },
      })
      allowedIds = events.filter(e => e.templateId != null && responsibleSet.has(e.templateId)).map(e => e.id)
    }

    if (allowedIds.length === 0) return { ok: true, deleted: 0 }

    await bulkDeleteEvents(db, allowedIds, congregationId)
    logger.info(`Bulk deleted ${allowedIds.length} events.`)
    return { ok: true, deleted: allowedIds.length }
  })
}
