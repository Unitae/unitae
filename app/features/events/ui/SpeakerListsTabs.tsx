import { NavLink } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

// The two sides of the visiting speakers: the lists other congregations send us, and the one we send them.

export function SpeakerListsTabs({ received, ours }: { received: number; ours: number }) {
  const tabs = [
    { to: '/programs/external-speakers', label: m.external_speakers_tab_received(), count: received, end: true },
    { to: '/programs/external-speakers/ours', label: m.external_speakers_tab_ours(), count: ours, end: false },
  ]
  return (
    <nav aria-label={m.external_speakers_tabs_label()} className="border-border flex gap-1 border-b">
      {tabs.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          // `end` on the received lists only: without it their index route matches « Notre liste » too.
          end={tab.end}
          className={({ isActive }) =>
            cn(
              '-mb-px inline-flex min-h-10 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors duration-(--u-duration-fast) outline-none',
              'focus-visible:ring-ring focus-visible:ring-2',
              isActive
                ? 'border-b-foreground text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground border-b-transparent',
            )
          }
        >
          {tab.label}
          <span className="text-faint text-xs font-normal tabular-nums">{tab.count}</span>
        </NavLink>
      ))}
    </nav>
  )
}
