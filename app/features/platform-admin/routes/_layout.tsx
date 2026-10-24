import { Outlet } from 'react-router'

import { verifyPlatformAdmin } from '~/features/platform-admin/server/verify-platform-admin.server'

import type { Route } from './+types/_layout'

// Runs before every child loader and action, not only page loads.
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }) => {
    await verifyPlatformAdmin(request)
  },
]

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await verifyPlatformAdmin(request)
  return { admin }
}

export default function PlatformAdminLayout() {
  return <Outlet />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
