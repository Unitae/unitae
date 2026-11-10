import { data, redirect } from 'react-router'
import { revokeCalendarFeedToken } from '~/features/authentication/server/calendar-feed-token.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { Route } from './+types/calendar-feed-revoke'

export function loader() {
  throw redirect('/me/profile')
}

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)

  await revokeCalendarFeedToken(currentUser.id)

  audit({
    action: AuditAction.CalendarFeedTokenRevoked,
    congregationId: currentUser.congregationId,
    actorId: currentUser.id,
    entityType: 'User',
    entityId: currentUser.id,
  })

  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', m.account_calendar_deleted())
  // Data, not a redirect: the confirmation dialog closes on it.
  return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
}
