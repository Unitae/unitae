import { redirect } from 'react-router'
import { revokeCalendarFeedToken } from '~/features/authentication/server/calendar-feed-token.server'
import { userContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { Route } from './+types/calendar-feed-revoke'

export function loader() {
  throw redirect('/me/profile')
}

export async function action({ context }: Route.ActionArgs) {
  const currentUser = context.get(userContext)

  await revokeCalendarFeedToken(currentUser.id)

  audit({
    action: AuditAction.CalendarFeedTokenRevoked,
    congregationId: currentUser.congregationId,
    actorId: currentUser.id,
    entityType: 'User',
    entityId: currentUser.id,
  })

  return redirect('/me/profile')
}
