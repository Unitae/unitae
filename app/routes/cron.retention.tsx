import { runRetentionCleanup } from '~/shared/libs/retention.server'
import { verifyCronSecret } from '~/shared/libs/cron.server'

import type { Route } from './+types/cron.retention'

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  if (!verifyCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runRetentionCleanup()

  return Response.json({
    ok: true,
    cleaned: result,
  })
}
