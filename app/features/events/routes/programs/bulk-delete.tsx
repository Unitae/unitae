import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { bulkEventIdsSchema } from '~/features/events/schemas/bulk-event-ids.schema'
import { bulkDeleteEvents } from '~/features/events/server/event-parts.server'
import { canManageAnyProgram, filterToManageableEventIds } from '~/features/events/server/events-auth.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'

import type { Route } from './+types/bulk-delete'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  const payload = bulkEventIdsSchema.safeParse(await request.json())
  if (!payload.success) {
    logger.warn(
      `Bulk delete rejected — invalid payload. User: ${currentUser.id}. Issues: ${payload.error.issues.map(i => i.message).join('; ')}`,
    )
    return { ok: false, error: 'invalid_payload' as const }
  }
  const { ids } = payload.data

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (p: Permission) => permissions.has(p)
    if (!(await canManageAnyProgram(db, can, currentUser.id, congregationId))) throw redirect('/programs')

    const allowedIds = await filterToManageableEventIds(db, can, ids, currentUser.id, congregationId)
    if (allowedIds.length === 0) return { ok: true, deleted: 0, emptied: 0 }

    const { count, emptied } = await bulkDeleteEvents(db, allowedIds, congregationId, currentUser.id)
    logger.info(`Bulk deleted ${count} events; removed the programme of ${emptied} with attendance.`)
    // One string per flash key: both outcomes go in the same toast.
    const session = await getSession(request.headers.get('Cookie'))
    const message = [
      count > 0 ? m.programs_bulk_delete_success({ count }) : null,
      emptied > 0 ? m.programs_bulk_delete_kept_attendance({ count: emptied }) : null,
    ]
      .filter(Boolean)
      .join(' ')
    if (message) session.flash('success', message)
    return data({ ok: true, deleted: count, emptied }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
