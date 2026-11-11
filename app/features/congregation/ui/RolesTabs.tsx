import { NavLink } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

// Two views of the same roles: the organigram answers « who answers to whom », Équipes « who is in which team ».

const TABS = [
  { to: '/congregation/roles/organigram', label: m.org_tab_chart },
  { to: '/congregation/roles', label: m.org_tab_teams },
] as const

export function RolesTabs() {
  return (
    <nav aria-label={m.org_tab_label()} className="border-border flex gap-1 border-b">
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          // `end` on Équipes only: without it the index route matches the organigram URL too and both tabs light up.
          end={tab.to === '/congregation/roles'}
          className={({ isActive }) =>
            cn(
              '-mb-px min-h-10 border-b-2 px-3 py-2 text-sm transition-colors duration-(--u-duration-fast) outline-none',
              'focus-visible:ring-ring focus-visible:ring-2',
              isActive
                ? 'border-b-foreground text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground border-b-transparent',
            )
          }
        >
          {tab.label()}
        </NavLink>
      ))}
    </nav>
  )
}
