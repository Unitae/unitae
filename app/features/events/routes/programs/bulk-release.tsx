import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { bulkEventIdsSchema } from '~/features/events/schemas/bulk-event-ids.schema'
import { bulkReleaseEvents } from '~/features/events/server/event-status-bulk.server'
import { canManageAnyProgram, filterToManageableEventIds } from '~/features/events/server/events-auth.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { joinMessages } from '~/shared/utils/join-messages'

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
    return filterToManageableEventIds(db, can, ids, currentUser.id, congregationId, Permission.CanPublishPrograms)
  })

  // The outer gate asks whether the caller can manage any programme at all, while the
  // filter asks for the publish capability — different permissions since the split. So a
  // programme manager without publish rights passes the gate and gets an empty list. Say
  // so: otherwise the page reports nothing at all and the click looks like it did work.
  if (ids.length > 0 && allowedIds.length === 0) {
    session.flash('error', m.programs_bulk_not_permitted())
    return data({ ok: false }, { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  // Phase 2: per-event scoped release. Each event opens its own withScope
  // inside bulkReleaseEvents so a slow/failing event only rolls back itself,
  // and partial progress is preserved on batch failure.
  const { released, blocked, notFound, failed } = await bulkReleaseEvents(allowedIds, congregationId, currentUser.id, {
    locale: cong.locale,
    timezone: cong.timezone,
  })
  logger.info(
    `Bulk released ${released.length} events; ${blocked.length} blocked; ${notFound.length} not found; ${failed.length} failed.`,
  )

  // session.flash stores one string per key, so multiple flash('error', ...)
  // calls silently overwrite each other. Aggregate the buckets into a single
  // toast per severity to preserve every non-empty message.
  if (released.length > 0) session.flash('success', m.programs_release_success_bulk({ count: released.length }))
  const errorMessage = joinMessages([
    blocked.length > 0 && m.programs_release_blocked_bulk({ count: blocked.length }),
    failed.length > 0 && m.programs_release_failed_bulk({ count: failed.length }),
    notFound.length > 0 && m.programs_bulk_not_found({ count: notFound.length }),
  ])
  if (errorMessage) session.flash('error', errorMessage)
  return data(
    { ok: true, released: released.length, blocked, notFound: notFound.length, failed: failed.length },
    { headers: { 'Set-Cookie': await commitSession(session) } },
  )
}
