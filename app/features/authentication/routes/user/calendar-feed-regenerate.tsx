import { data, redirect } from 'react-router'
import {
  createCalendarFeedToken,
  getCalendarFeedToken,
} from '~/features/authentication/server/calendar-feed-token.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { Route } from './+types/calendar-feed-regenerate'

export function loader() {
  throw redirect('/me/profile')
}

/** Creates the account's calendar link, or replaces it: the old one stops working. */
export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)
  const replacing = (await getCalendarFeedToken(currentUser.id)) != null

  await createCalendarFeedToken(currentUser.id)

  audit({
    action: AuditAction.CalendarFeedTokenCreated,
    congregationId: currentUser.congregationId,
    actorId: currentUser.id,
    entityType: 'User',
    entityId: currentUser.id,
  })

  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', replacing ? m.account_calendar_changed() : m.account_calendar_created())
  // Data, not a redirect: the confirmation dialog closes on it, and the page revalidates with the new link.
  return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
}
