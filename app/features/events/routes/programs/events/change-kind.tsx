import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { kindChangeFrom } from '~/features/events/schemas/kind-change.schema'
import { changeEventKind, type KindChangeRefusal } from '~/features/events/server/event-kind-change.server'
import { fireCancellationNotifications } from '~/features/events/server/event-status.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/change-kind'

const REFUSALS: Record<KindChangeRefusal, () => string> = {
  'kind-held': () => m.programs_kind_change_kind_held(),
  'not-suggested': () => m.programs_kind_change_not_suggested(),
  stale: () => m.programs_kind_change_stale(),
}

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

/**
 * « Changer le type » (D40): the meeting moves to another kind, keeping the schedules chosen and adding the new
 * kind's suggestions chosen. The assignees of a published schedule removed are told « Attribution annulée » once it
 * is done, about the meeting as they knew it.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const cong = context.get(congregationContext)
  const eventId = requireParamId(params.eventId, '/programs')
  const parsed = kindChangeFrom(await request.formData())
  if (!parsed.success) return data({ ok: false as const }, { status: 400 })
  const { congregationId } = currentUser

  const outcome = await withScopeFromContext(context, db => {
    const can = (p: Permission) => permissions.has(p)
    return changeEventKind(db, can, currentUser.id, eventId, parsed.data, congregationId)
  })
  // The event, or the kind chosen, has gone since the page loaded: back to the page, which says what is left.
  if (outcome == null) throw redirect(`/programs/events/${eventId}`)
  // Refused, or not as sent: said on the page, which stays, rather than a silent trip to the list.
  if ('refused' in outcome || 'reason' in outcome) {
    session.flash('error', 'reason' in outcome ? REFUSALS[outcome.reason]() : m.programs_kind_change_refused())
    return data({ ok: false as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  await fireCancellationNotifications(outcome.event, outcome.notifyTargets, congregationId, currentUser.id, {
    locale: cong.locale,
    timezone: cong.timezone,
  })
  session.flash('success', m.programs_kind_change_done())
  logger.info(`Event kind changed. User: ${currentUser.id}. Event: ${eventId}. Kind: ${parsed.data.kindId}.`)
  return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
}
