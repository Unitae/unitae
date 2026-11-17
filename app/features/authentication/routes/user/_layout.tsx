import { Outlet } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import type { Route } from './+types/_layout'

// Opening, closing or swapping the « ? » article changes only `?help=`: the page keeps its data.
export { skipRevalidationForHelpPanel as shouldRevalidate } from '~/features/help'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.account_title()} - Unitae` }]
}

export function loader(_args: Route.LoaderArgs) {
  return {}
}

export default function UserLayout() {
  return <Outlet />
}
