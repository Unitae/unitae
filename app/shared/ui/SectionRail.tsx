import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '~/shared/utils/utils'

export interface SectionRailItem {
  to: string
  label: string
  icon: LucideIcon
  /** A page outside the app (the subscription): opens in a new tab, marked with an arrow. */
  external?: { hint: string }
}

export interface SectionRailGroup {
  /** The group's small label; a column of a single group repeats its name instead. */
  label: string
  items: SectionRailItem[]
}

const RAIL_ITEM =
  'flex h-8 items-center gap-2.5 rounded-md px-2 font-medium text-muted-foreground text-sm outline-hidden transition-colors duration-(--u-duration-fast) hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-selected aria-[current=page]:text-foreground [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-faint aria-[current=page]:[&>svg]:text-brand'

interface SectionRailProps {
  /** Names the navigation for assistive technologies. */
  label: string
  groups: SectionRailGroup[]
  className?: string
}

/**
 * The column of an area's parts (« Mon compte », Réglages), on wide screens: each group under its small label, the
 * current part lit. Sticky beside the page; phones get the area's own way through instead.
 */
export function SectionRail({ label, groups, className }: SectionRailProps) {
  return (
    <nav aria-label={label} data-sticky-content className={cn('flex flex-col gap-0.5 md:sticky md:top-4', className)}>
      {groups.map((group, index) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className={cn('px-2 pb-1.5 font-medium text-faint text-xs', index > 0 && 'pt-3')}>{group.label}</p>
          {group.items.map(({ to, label: text, icon: Icon, external }) =>
            external ? (
              <a key={to} href={to} target="_blank" rel="noreferrer" className={RAIL_ITEM}>
                <Icon aria-hidden="true" />
                {text}
                <ArrowUpRight aria-hidden="true" className="ml-auto size-3.5!" />
                <span className="sr-only">({external.hint})</span>
              </a>
            ) : (
              <NavLink key={to} to={to} className={RAIL_ITEM}>
                <Icon aria-hidden="true" />
                {text}
              </NavLink>
            ),
          )}
        </div>
      ))}
    </nav>
  )
}
