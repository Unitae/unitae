import { Bell, Lock, type LucideIcon, ShieldCheck, SlidersHorizontal, User } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SectionRail } from '~/shared/ui/SectionRail'
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
      <SectionRail
        label={m.account_title()}
        groups={[
          {
            label: m.account_title(),
            items: ACCOUNT_SECTIONS.map(({ to, label, icon }) => ({ to, label: label(), icon })),
          },
        ]}
        className="max-md:hidden md:mt-12"
      />

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
