import { timingSafeEqual } from 'node:crypto'
import { runRetentionCleanup } from '~/shared/libs/retention.server'

import type { Route } from './+types/cron.retention'

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return false

  const token = auth.slice(7)
  if (token.length !== secret.length) return false

  return timingSafeEqual(Buffer.from(token), Buffer.from(secret))
}

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
