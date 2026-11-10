import { Bell, Lock, type LucideIcon, ShieldCheck, SlidersHorizontal, User } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { PageHeader } from '~/shared/ui/PageHeader'
import { cn } from '~/shared/utils/utils'

interface AccountSection {
  to: string
  label: () => string
  icon: LucideIcon
}

/** The parts of « Mon compte », in the order its column lists them. */
export const ACCOUNT_SECTIONS: readonly AccountSection[] = [
  { to: '/me/profile', label: m.account_section_profile, icon: User },
  { to: '/me/preferences', label: m.account_section_preferences, icon: SlidersHorizontal },
  { to: '/me/security', label: m.account_section_security, icon: ShieldCheck },
  { to: '/me/notifications', label: m.account_section_notifications, icon: Bell },
  { to: '/me/privacy', label: m.account_section_privacy, icon: Lock },
]

const RAIL_ITEM =
  'flex h-8 items-center gap-2.5 rounded-md px-2 font-medium text-muted-foreground text-sm outline-hidden transition-colors duration-(--u-duration-fast) hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-selected aria-[current=page]:text-foreground [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-faint aria-[current=page]:[&>svg]:text-brand'

const CHIP =
  'inline-flex h-9 flex-none items-center rounded-full border bg-card px-3.5 font-medium text-sm outline-none transition-colors duration-(--u-duration-fast) focus-visible:ring-2 focus-visible:ring-ring'

interface AccountPageProps {
  title: string
  subtitle?: string
  children: ReactNode
}

/**
 * One part of « Mon compte »: the column of its parts on the left (pills that scroll sideways on a phone), the
 * part's title, then its blocks.
 */
export function AccountPage({ title, subtitle, children }: AccountPageProps) {
  return (
    <div className="md:grid md:grid-cols-[11.5rem_minmax(0,1fr)] md:items-start md:gap-10">
      <nav
        aria-label={m.account_title()}
        data-sticky-content
        className="flex flex-col gap-0.5 max-md:hidden md:sticky md:top-4 md:mt-12"
      >
        <p className="px-2 pb-1.5 font-medium text-faint text-xs">{m.account_title()}</p>
        {ACCOUNT_SECTIONS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={RAIL_ITEM}>
            <Icon aria-hidden="true" />
            {label()}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0 max-w-3xl">
        <PageHeader
          title={title}
          subtitle={subtitle}
          breadcrumbs={[{ label: m.account_title(), to: '/me/profile' }, { label: title }]}
        />
        <nav
          aria-label={m.account_title()}
          className="-mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:hidden"
        >
          {ACCOUNT_SECTIONS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(CHIP, isActive ? 'border-foreground text-foreground' : 'border-border text-muted-foreground')
              }
            >
              {label()}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col gap-8">{children}</div>
      </div>
    </div>
  )
}
