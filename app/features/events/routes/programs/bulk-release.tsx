import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { releaseEvent } from '~/features/events/server/event-status.server'
import { canManageAnyProgram, getResponsibleTemplateIds } from '~/features/events/server/programme-auth.server'
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

  const { ids } = (await request.json()) as { ids: number[] }
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false }

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

    if (allowedIds.length === 0) return { ok: true, released: 0, blocked: [] as { id: number; error: string }[] }

    // Iterate per event so a single conflict blocks only its own release
    // rather than aborting the whole batch. releaseEvent returns `{ error }`
    // for conflicts (no throw), which keeps this transaction alive.
    const released: number[] = []
    const blocked: { id: number; error: string }[] = []
    for (const id of allowedIds) {
      const result = await releaseEvent(db, id, congregationId, currentUser.id, {
        locale: cong.locale,
        timezone: cong.timezone,
      })
      if (result == null) continue
      if ('error' in result) blocked.push({ id, error: result.error })
      else released.push(id)
    }
    logger.info(`Bulk released ${released.length} events; ${blocked.length} blocked.`)

    if (released.length > 0) {
      session.flash('success', m.programs_release_success_bulk({ count: released.length }))
    }
    if (blocked.length > 0) {
      // The toast is intentionally count-only. Naming each blocker would
      // become unreadable with several conflicts on the same event; the
      // events list amber Conflit badge already flags which rows to fix.
      session.flash('error', m.programs_release_blocked_bulk({ count: blocked.length }))
    }
    return data(
      { ok: true, released: released.length, blocked },
      { headers: { 'Set-Cookie': await commitSession(session) } },
    )
  })
}
