import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { scheduleAddSchema } from '~/features/events/schemas/schedule-add.schema'
import { addEventSchedule } from '~/features/events/server/schedule-add.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/schedule-add'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

/** « Ajouter un planning » (D39): « Gérer », or the responsible of that template; an empty one is the managers'. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const eventId = requireParamId(params.eventId, '/programs')
  const parsed = scheduleAddSchema.safeParse(Object.fromEntries(await request.formData()))
  if (!parsed.success) return data({ ok: false as const, error: 'invalid' as const }, { status: 400 })

  return withScopeFromContext(context, async db => {
    const can = (p: Permission) => permissions.has(p)
    const { congregationId } = currentUser
    const outcome = await addEventSchedule(db, can, currentUser.id, eventId, parsed.data, congregationId)
    if (outcome == null || ('refused' in outcome && outcome.refused === 'right')) throw redirect('/programs')
    if ('refused' in outcome) {
      session.flash('error', m.programs_schedule_add_kind_held())
      return data({ ok: false as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
    }
    session.flash('success', m.programs_schedule_added())
    logger.info(`Schedule added. User: ${currentUser.id}. Event: ${eventId}. Schedule: ${outcome.schedule.id}.`)
    return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
