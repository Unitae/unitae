import { seedPendingDemoCopies } from '~/features/demo/index.server'
import { verifyCronSecret } from '~/shared/utils/cron.server'

import type { Route } from './+types/cron.demo-seed'

// Fills the demo copies the control plane created (docs/development/specs/demo-mode.md). Does nothing unless demo
// mode is on.
export async function loader({ request }: Route.LoaderArgs) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  if (!verifyCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return Response.json({ ok: true, seeded: await seedPendingDemoCopies() })
}
