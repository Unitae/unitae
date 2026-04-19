import { Outlet } from 'react-router'
import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Mon compte - Unitae' }]
}

export async function loader(_args: Route.LoaderArgs) {
  return {}
}

export default function UserLayout() {
  return <Outlet />
}
