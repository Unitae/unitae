import { redirect } from 'react-router'
import { bulkDeleteEvents } from '~/features/events/server/programme-events.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/bulk-delete'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.ProgramManager)) throw redirect('/')

  const { ids } = (await request.json()) as { ids: number[] }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    await bulkDeleteEvents(db, ids, congregationId)
    logger.info(`Bulk deleted ${ids.length} events.`)
    return { ok: true, deleted: ids.length }
  })
}
