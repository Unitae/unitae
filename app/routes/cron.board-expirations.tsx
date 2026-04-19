import { checkExpiringDocuments } from '~/features/display-board/server/expiration-notifications.server'
import { verifyCronSecret } from '~/shared/libs/cron.server'

import type { Route } from './+types/cron.board-expirations'

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  if (!verifyCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await checkExpiringDocuments()

  return Response.json({
    ok: true,
    ...result,
  })
}
