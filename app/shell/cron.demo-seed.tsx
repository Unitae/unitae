import { seedPendingDemoCopies } from '~/features/demo/index.server'
import { verifyCronSecret } from '~/shared/utils/cron.server'

import type { Route } from './+types/cron.demo-seed'

// Fills the demo copies the control plane created. Does nothing unless demo
// mode is on.
export async function loader({ request }: Route.LoaderArgs) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  if (!verifyCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { seeded, failed } = await seedPendingDemoCopies()
  // Every copy failing is a fault to notice (the job fails), not « nothing to do ».
  return Response.json({ ok: failed === 0, seeded, failed }, { status: failed > 0 && seeded === 0 ? 500 : 200 })
}
