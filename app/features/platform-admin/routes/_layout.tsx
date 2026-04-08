import { Outlet } from 'react-router'

import { verifyPlatformAdmin } from '~/features/platform-admin/server/verify-platform-admin.server'

import type { Route } from './+types/_layout'

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await verifyPlatformAdmin(request)
  return { admin }
}

export default function PlatformAdminLayout() {
  return <Outlet />
}
