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
  if (!parsed.success) return data({ ok: false as const, error: m.programs_schedule_name_invalid() }, { status: 400 })

  const outcome = await withScopeFromContext(context, db => {
    const can = (p: Permission) => permissions.has(p)
    return addEventSchedule(db, can, currentUser.id, eventId, parsed.data, currentUser.congregationId)
  })
  // The event, or the template chosen, has gone since the page loaded: back to the page, which says what is left.
  if (outcome == null) throw redirect(`/programs/events/${eventId}`)
  if ('refused' in outcome) throw redirect('/programs')
  if ('reason' in outcome) {
    session.flash(
      'error',
      outcome.reason === 'kind-held' ? m.programs_schedule_add_kind_held() : m.programs_schedule_add_awaiting(),
    )
    return data({ ok: false as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
  }
  session.flash('success', m.programs_schedule_added())
  logger.info(`Schedule added. User: ${currentUser.id}. Event: ${eventId}. Schedule: ${outcome.schedule.id}.`)
  return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
}
