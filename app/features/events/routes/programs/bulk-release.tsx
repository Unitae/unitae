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
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/bulk-release'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

export async function action({ request, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const cong = context.get(congregationContext)
  const isProgramManager = permissions.has(Permission.ProgramManager)

  const payload = bulkEventIdsSchema.safeParse(await request.json())
  if (!payload.success) {
    logger.warn(
      `Bulk release rejected — invalid payload. User: ${currentUser.id}. Issues: ${payload.error.issues.map(i => i.message).join('; ')}`,
    )
    return { ok: false, error: 'invalid_payload' as const }
  }
  const { ids } = payload.data

  // Extend the tx timeout: each releaseEvent does ~1 findFirst + 1 update +
  // 1 audit + N notification enqueues (~2 queries each) — a large batch can
  // exceed Prisma's 5s default. 30s keeps us safely below any reasonable
  // real-world batch size while staying below the pgbouncer idle timeout.
  return withScopeFromContext(
    context,
    async db => {
      const { congregationId } = currentUser
      const can = (p: Permission) => permissions.has(p)
      if (!(await canManageAnyProgram(db, can, currentUser.id, congregationId))) throw redirect('/programs')

      const allowedIds = await filterToManageableEventIds(db, ids, currentUser.id, congregationId, isProgramManager)
      const { released, blocked } = await bulkReleaseEvents(db, allowedIds, congregationId, currentUser.id, {
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
    },
    { timeout: 30_000 },
  )
}
