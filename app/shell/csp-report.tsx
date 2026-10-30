import { collectCspReport } from '~/shared/middleware/csp-report.server'

import type { Route } from './+types/csp-report'

// Where browsers POST the violations of the Content-Security-Policy (see security-headers.server.ts).
export function action({ request }: Route.ActionArgs) {
  return collectCspReport(request)
}

export function loader() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } })
}
