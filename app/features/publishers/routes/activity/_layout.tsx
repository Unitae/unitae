import { NavLink, Outlet } from 'react-router'

import * as m from '~/i18n/paraglide/messages'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'rounded-md bg-background px-4 py-2 text-center font-medium text-sm shadow-sm'
    : 'rounded-md px-4 py-2 text-center text-muted-foreground text-sm hover:text-foreground'

export default function ActivityLayout() {
  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-2 rounded-lg border bg-muted/50 p-1.5">
        <NavLink to="/publishers/activity" end className={tabClass}>
          {m.pioneers_tab_publishers()}
        </NavLink>
        <NavLink to="/publishers/activity/pioneers" className={tabClass}>
          {m.pioneers_tab_pioneers()}
        </NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
