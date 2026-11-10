import { Outlet } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.account_title()} - Unitae` }]
}

export function loader(_args: Route.LoaderArgs) {
  return {}
}

export default function UserLayout() {
  return <Outlet />
}
