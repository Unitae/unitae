import { flushSettledNotifications } from '~/features/notifications/server/flush-settled.server'
import { verifyCronSecret } from '~/shared/utils/cron.server'

import type { Route } from './+types/cron.process-notifications'

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  if (!verifyCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await flushSettledNotifications()

  return Response.json({
    ok: true,
    ...result,
  })
}
