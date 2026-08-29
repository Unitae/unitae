import { NavLink } from 'react-router'
import { cn } from '~/shared/utils/utils'

// Two views of the same data, one surface.
//
// The organigram answers "who reports to whom"; the matrix answers "who may do this kind of
// work" — populations like « commerces » or « micros » that hold no place in the chart. They
// were separate pages nobody linked between, and the sidebar now points at the chart, so the
// matrix needs a way back.

const TABS = [
  { to: '/congregation/roles/organigram', label: 'Organigramme' },
  { to: '/congregation/roles', label: 'Groupes d’aptitude' },
] as const

export function RolesTabs() {
  return (
    <nav aria-label="Vues des rôles" className="flex gap-1 border-b">
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          // `end` on the matrix only: without it the index route matches the organigram URL too
          // and both tabs light up.
          end={tab.to === '/congregation/roles'}
          className={({ isActive }) =>
            cn(
              '-mb-px min-h-11 border-b-2 px-3 py-2 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              isActive
                ? 'border-b-primary font-medium text-foreground'
                : 'border-b-transparent text-muted-foreground hover:text-foreground',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
