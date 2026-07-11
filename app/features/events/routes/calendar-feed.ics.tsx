import { findUserByCalendarFeedToken, touchCalendarFeedToken } from '~/features/authentication'
import { buildPersonalCalendarIcs } from '~/features/events/server/build-personal-calendar.server'
import { getPersonalAssignments } from '~/features/events/server/personal-assignments.server'
import { withScope } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import type { Route } from './+types/calendar-feed.ics'

const HORIZON_MONTHS = 3
const CACHE_MAX_AGE_SECONDS = 300

export async function loader({ params, request }: Route.LoaderArgs) {
  const token = params.token
  if (!token) {
    return notFound()
  }

  const resolved = await findUserByCalendarFeedToken(token)
  if (resolved == null) {
    logger.info('Calendar feed token not found')
    return notFound()
  }

  const since = new Date()
  since.setMonth(since.getMonth() - HORIZON_MONTHS)

  const ics = await withScope(resolved.user.congregationId, async db => {
    const items = await getPersonalAssignments(db, resolved.user.id, since)
    return buildPersonalCalendarIcs({
      items,
      userLabel: resolved.user.firstname || resolved.user.email,
      uidDomain: new URL(request.url).hostname,
    })
  })

  touchCalendarFeedToken(resolved.tokenId)

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="unitae-calendar.ics"',
      'Cache-Control': `private, max-age=${CACHE_MAX_AGE_SECONDS}`,
    },
  })
}

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
  })
}
