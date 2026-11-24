import { redirect } from 'react-router'
import { bulkEventIdsSchema } from '~/features/events/schemas/bulk-event-ids.schema'
import { bulkPublishPreview } from '~/features/events/server/bulk-publish-preview.queries'
import { canManageAnyProgram } from '~/features/events/server/events-auth.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/bulk-release-preview'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

/**
 * What bulk « Publier » will do with each draft schedule of the selection, asked before it runs (design round A). The
 * same payload and the same gate as bulk-release; a read, so nothing is written.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const payload = bulkEventIdsSchema.safeParse(await request.json())
  if (!payload.success) {
    logger.warn(`Bulk release preview rejected — invalid payload. User: ${currentUser.id}.`)
    return { ok: false as const, error: 'invalid_payload' as const }
  }
  const { congregationId } = currentUser
  const can = (p: Permission) => permissions.has(p)
  return withScopeFromContext(context, async db => {
    const mayPublishAny =
      can(Permission.CanPublishPrograms) || (await canManageAnyProgram(db, can, currentUser.id, congregationId))
    if (!mayPublishAny) throw redirect('/programs')
    const preview = await bulkPublishPreview(db, can, currentUser.id, payload.data.ids, congregationId)
    return { ok: true as const, preview }
  })
}
