import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { bulkEventIdsSchema } from '~/features/events/schemas/bulk-event-ids.schema'
import { bulkUnreleaseEvents } from '~/features/events/server/event-status-bulk.server'
import { canManageAnyProgram, filterToManageableEventIds } from '~/features/events/server/events-auth.server'
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

  // Phase 1: authorise + filter in a tiny scoped tx.
  const { congregationId } = currentUser
  const allowedIds = await withScopeFromContext(context, async db => {
    const can = (p: Permission) => permissions.has(p)
    if (!(await canManageAnyProgram(db, can, currentUser.id, congregationId))) throw redirect('/programs')
    return filterToManageableEventIds(db, can, ids, currentUser.id, congregationId, Permission.CanPublishPrograms)
  })

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
  ])
  if (errorMessage) session.flash('error', errorMessage)
  return data(
    { ok: true, unreleased: unreleased.length, notFound: notFound.length, failed: failed.length },
    { headers: { 'Set-Cookie': await commitSession(session) } },
  )
}
