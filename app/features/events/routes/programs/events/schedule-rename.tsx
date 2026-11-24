import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { scheduleNameSchema } from '~/features/events/schemas/schedule-name.schema'
import { renameEventSchedule } from '~/features/events/server/schedule-changes.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/schedule-rename'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

/** Renames one schedule on this event only (D44): « Gérer », or the responsible of its template. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const eventId = requireParamId(params.eventId, '/programs')
  const scheduleId = requireParamId(params.scheduleId, '/programs')
  const parsed = scheduleNameSchema.safeParse(Object.fromEntries(await request.formData()))
  if (!parsed.success) return data({ ok: false as const, error: m.programs_schedule_name_invalid() }, { status: 400 })

  return withScopeFromContext(context, async db => {
    const can = (p: Permission) => permissions.has(p)
    const { congregationId } = currentUser
    const outcome = await renameEventSchedule(
      db,
      can,
      currentUser.id,
      eventId,
      scheduleId,
      parsed.data.name,
      congregationId,
    )
    if (outcome == null || 'refused' in outcome) throw redirect('/programs')

    // The name it already had: nothing to say.
    if (!outcome.result.changed) return data({ ok: true as const })
    session.flash('success', m.programs_schedule_renamed())
    logger.info(`Schedule renamed. User: ${currentUser.id}. Event: ${eventId}. Schedule: ${scheduleId}.`)
    return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
