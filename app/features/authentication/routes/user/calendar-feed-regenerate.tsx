import { redirect } from 'react-router'
import { createCalendarFeedToken } from '~/features/authentication/server/calendar-feed-token.server'
import { currentAccountContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { Route } from './+types/calendar-feed-regenerate'

export function loader() {
  throw redirect('/me/profile')
}

export async function action({ context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)

  await createCalendarFeedToken(currentUser.id)

  audit({
    action: AuditAction.CalendarFeedTokenCreated,
    congregationId: currentUser.congregationId,
    actorId: currentUser.id,
    entityType: 'User',
    entityId: currentUser.id,
  })

  return redirect('/me/profile')
}
