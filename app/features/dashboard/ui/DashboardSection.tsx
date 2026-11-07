import { StatusIcon } from '@unitae/ui'
import type { LucideIcon } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { Link } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

interface DashboardSectionProps {
  title: ReactNode
  /** Quiet context after the title: a count, a date. */
  meta?: ReactNode
  /** The page where the whole list lives, at the end of the heading line. */
  link?: { to: string; label: string }
  /** Extra controls on the heading line, before the link. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** One dashboard block: a heading line above a bordered panel. */
export function DashboardSection({ title, meta, link, actions, children, className }: DashboardSectionProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={cn('flex min-w-0 flex-col gap-2.5', className)}>
      <div className="flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 id={headingId} className="font-semibold text-[15px] leading-snug">
          {title}
        </h2>
        {meta != null && <span className="text-faint text-sm tabular-nums">{meta}</span>}
        <span className="flex-1" />
        {actions}
        {link && (
          <Link
            to={link.to}
            className="rounded-sm font-medium text-brand-text text-sm underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {link.label}
          </Link>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">{children}</div>
    </section>
  )
}

/** A list row inside a panel: 40 px at least, hairlines between rows. */
export const panelRowClass = 'flex min-h-10 items-center gap-3 border-border border-b px-3.5 last:border-b-0'

/** The same row when it leads somewhere: hover tint and a visible focus. */
export const panelLinkRowClass = cn(
  panelRowClass,
  'outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
)

/** A widget whose query failed: say so in place rather than hide the block. */
export function PanelError() {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-3 text-muted-foreground text-sm">
      <StatusIcon tone="warning" />
      {m.dashboard_widget_error()}
    </div>
  )
}

interface PanelEmptyProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

/** A compact empty state sized for a dashboard panel. */
export function PanelEmpty({ icon: Icon, title, description, action }: PanelEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
      {Icon && <Icon aria-hidden="true" className="size-5 text-faint" />}
      <p className="font-medium text-sm">{title}</p>
      {description && <p className="max-w-xs text-muted-foreground text-sm">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
