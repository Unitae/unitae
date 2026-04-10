import { Outlet } from 'react-router'

import type { Route } from './+types/_layout'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Mon compte - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await authenticateAndAuthorize(request)
  return {}
}

export default function UserLayout() {
  return <Outlet />
}
