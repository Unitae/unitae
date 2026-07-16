import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { bulkEventIdsSchema } from '~/features/events/schemas/bulk-event-ids.schema'
import { bulkReleaseEvents } from '~/features/events/server/event-status.server'
import { canManageAnyProgram, filterToManageableEventIds } from '~/features/events/server/programme-auth.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'

import type { Route } from './+types/bulk-release'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

export async function action({ request, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const cong = context.get(congregationContext)

  const payload = bulkEventIdsSchema.safeParse(await request.json())
  if (!payload.success) {
    logger.warn(
      `Bulk release rejected — invalid payload. User: ${currentUser.id}. Issues: ${payload.error.issues.map(i => i.message).join('; ')}`,
    )
    return { ok: false, error: 'invalid_payload' as const }
  }
  const { ids } = payload.data

  // Phase 1: authorise + filter in a tiny scoped tx. This part is bounded
  // (single findMany, single check) and fits comfortably in the default
  // Prisma budget.
  const { congregationId } = currentUser
  const allowedIds = await withScopeFromContext(context, async db => {
    const can = (p: Permission) => permissions.has(p)
    if (!(await canManageAnyProgram(db, can, currentUser.id, congregationId))) throw redirect('/programs')
    return filterToManageableEventIds(db, can, ids, currentUser.id, congregationId)
  })

  // Phase 2: per-event scoped release. Each event opens its own withScope
  // inside bulkReleaseEvents so a slow/failing event only rolls back itself,
  // and partial progress is preserved on batch failure.
  const { released, blocked } = await bulkReleaseEvents(allowedIds, congregationId, currentUser.id, {
    locale: cong.locale,
    timezone: cong.timezone,
  })
  logger.info(`Bulk released ${released.length} events; ${blocked.length} blocked.`)

  if (released.length > 0) session.flash('success', m.programs_release_success_bulk({ count: released.length }))
  if (blocked.length > 0) session.flash('error', m.programs_release_blocked_bulk({ count: blocked.length }))
  return data(
    { ok: true, released: released.length, blocked },
    { headers: { 'Set-Cookie': await commitSession(session) } },
  )
}
