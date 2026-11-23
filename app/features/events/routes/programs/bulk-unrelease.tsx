import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { bulkEventIdsSchema } from '~/features/events/schemas/bulk-event-ids.schema'
import { bulkUnreleaseEvents } from '~/features/events/server/event-status-bulk.server'
import { canManageAnyProgram } from '~/features/events/server/events-auth.server'
import { filterEventsByRight } from '~/features/events/server/schedule-rights.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { joinMessages } from '~/shared/utils/join-messages'

import type { Route } from './+types/bulk-unrelease'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

export async function action({ request, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  const payload = bulkEventIdsSchema.safeParse(await request.json())
  if (!payload.success) {
    logger.warn(
      `Bulk unrelease rejected — invalid payload. User: ${currentUser.id}. Issues: ${payload.error.issues.map(i => i.message).join('; ')}`,
    )
    return { ok: false, error: 'invalid_payload' as const }
  }
  const { ids } = payload.data

  // Phase 1: authorise + filter in a small scoped tx (see bulk-release.tsx).
  const { congregationId } = currentUser
  const allowedIds = await withScopeFromContext(context, async db => {
    const can = (p: Permission) => permissions.has(p)
    // « Publier » publishes any event; otherwise a responsible of some kind may hold events they answer for wholly.
    const mayPublishAny =
      can(Permission.CanPublishPrograms) || (await canManageAnyProgram(db, can, currentUser.id, congregationId))
    if (!mayPublishAny) throw redirect('/programs')
    // Each selected event by its own rule: « Publier », or the responsible of its every schedule (D49).
    return filterEventsByRight(db, can, ids, currentUser.id, congregationId, 'publish')
  })

  // The gate lets in whoever may publish some event, the filter keeps the selected ones they may: a manager without
  // « Publier », or a responsible of only part of each event's schedules (D31, D49), can end with none. Say so,
  // otherwise the page reports nothing and the click looks like it worked; a partial refusal is counted below.
  const skipped = ids.length - allowedIds.length
  if (ids.length > 0 && allowedIds.length === 0) {
    session.flash('error', m.programs_bulk_not_permitted())
    return data({ ok: false }, { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  // Phase 2: per-event scoped unrelease. See bulk-release.tsx for the
  // partial-progress rationale.
  const { unreleased, notFound, failed } = await bulkUnreleaseEvents(allowedIds, congregationId, currentUser.id)
  logger.info(`Bulk unreleased ${unreleased.length} events; ${notFound.length} not found; ${failed.length} failed.`)

  // See bulk-release.tsx for the flash-aggregation rationale.
  if (unreleased.length > 0) {
    session.flash('success', m.programs_unrelease_success_bulk({ count: unreleased.length }))
  }
  const errorMessage = joinMessages([
    failed.length > 0 && m.programs_unrelease_failed_bulk({ count: failed.length }),
    notFound.length > 0 && m.programs_bulk_not_found({ count: notFound.length }),
    skipped > 0 && m.programs_bulk_skipped({ count: skipped }),
  ])
  if (errorMessage) session.flash('error', errorMessage)
  return data(
    { ok: true, unreleased: unreleased.length, notFound: notFound.length, failed: failed.length },
    { headers: { 'Set-Cookie': await commitSession(session) } },
  )
}
