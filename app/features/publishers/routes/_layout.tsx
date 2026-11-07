import { Outlet } from 'react-router'
import { canEnterPublishersArea } from '~/features/publishers/model/area-access'
import * as m from '~/i18n/paraglide/messages'
import { layoutGate } from '~/shared/auth/route-context.server'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_layout_meta_title() }]
}

// Group responsibles / deputies and emergency-info holders reach the emergency routes here even
// without a publisher/program permission. Each child route self-gates, so admitting them is safe.
export const middleware: Route.MiddlewareFunction[] = [
  layoutGate((permissions, account) => canEnterPublishersArea(permissions, account.member)),
]

export default function CongregationLayout() {
  return <Outlet />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
