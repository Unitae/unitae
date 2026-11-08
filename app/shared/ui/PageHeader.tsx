import type { LucideIcon } from 'lucide-react'

import type { BreadcrumbEntry } from '~/shared/ui/PageBreadcrumb'
import { PageTopbar } from '~/shared/ui/PageTopbar'
import { cn } from '~/shared/utils/utils'

interface PageHeaderProps {
  title: string
  titleBadge?: React.ReactNode
  subtitle?: string
  actions?: React.ReactNode
  /** The page's crumbs, ending with the page itself. Without them the trail is the page's sidebar group and title. */
  breadcrumbs?: BreadcrumbEntry[]
  /** @deprecated The trail is the way back now; this is no longer drawn. */
  backTo?: string
  /** What the page is about, drawn in a quiet tile before the title (a building, a group…). */
  icon?: LucideIcon
  /** A line of facts under the subtitle, e.g. « Territoire 14 · 14 foyers · 3 entrées ». */
  meta?: React.ReactNode
}

export function PageHeader({ actions, title, titleBadge, subtitle, breadcrumbs, icon: Icon, meta }: PageHeaderProps) {
  return (
    <PageTopbar trail={breadcrumbs?.length ? breadcrumbs : [{ label: title }]} actions={actions}>
      <div className={cn('flex animate-fade-in-up', Icon ? 'items-start gap-4' : 'items-center gap-3')}>
        {Icon && (
          <span className="grid size-11 shrink-0 place-content-center rounded-lg border border-border bg-sidebar">
            <Icon className="size-5 text-faint" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="font-display font-semibold text-3xl tracking-tight max-sm:text-2xl">{title}</h1>
            {titleBadge}
          </div>
          {subtitle && <p className="mt-0.5 text-muted-foreground text-sm">{subtitle}</p>}
          {meta && <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-muted-foreground text-sm">{meta}</div>}
        </div>
      </div>
    </PageTopbar>
  )
}
