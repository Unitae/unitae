import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { bulkEventIdsSchema } from '~/features/events/schemas/bulk-event-ids.schema'
import { bulkUnreleaseEvents } from '~/features/events/server/event-status.server'
import { canManageAnyProgram, filterToManageableEventIds } from '~/features/events/server/programme-auth.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/bulk-unrelease'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

export async function action({ request, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const isProgramManager = permissions.has(Permission.ProgramManager)

  const payload = bulkEventIdsSchema.safeParse(await request.json())
  if (!payload.success) {
    logger.warn(
      `Bulk unrelease rejected — invalid payload. User: ${currentUser.id}. Issues: ${payload.error.issues.map(i => i.message).join('; ')}`,
    )
    return { ok: false, error: 'invalid_payload' as const }
  }
  const { ids } = payload.data

  // See bulk-release.tsx for the timeout rationale.
  return withScopeFromContext(
    context,
    async db => {
      const { congregationId } = currentUser
      const can = (p: Permission) => permissions.has(p)
      if (!(await canManageAnyProgram(db, can, currentUser.id, congregationId))) throw redirect('/programs')

      const allowedIds = await filterToManageableEventIds(db, ids, currentUser.id, congregationId, isProgramManager)
      const { unreleased } = await bulkUnreleaseEvents(db, allowedIds, congregationId, currentUser.id)
      logger.info(`Bulk unreleased ${unreleased.length} events.`)

      if (unreleased.length > 0) {
        session.flash('success', m.programs_unrelease_success_bulk({ count: unreleased.length }))
      }
      return data(
        { ok: true, unreleased: unreleased.length },
        { headers: { 'Set-Cookie': await commitSession(session) } },
      )
    },
    { timeout: 30_000 },
  )
}
