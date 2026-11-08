import { ArrowLeft, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '~/shared/ui/button'
import { type BreadcrumbEntry, PageBreadcrumb } from '~/shared/ui/PageBreadcrumb'
import { cn } from '~/shared/utils/utils'

interface PageHeaderProps {
  title: string
  titleBadge?: React.ReactNode
  subtitle?: string
  actions?: React.ReactNode
  breadcrumbs?: BreadcrumbEntry[]
  backTo?: string
  /** What the page is about, drawn in a quiet tile before the title (a building, a group…). */
  icon?: LucideIcon
  /** A line of facts under the subtitle, e.g. « Territoire 14 · 14 foyers · 3 entrées ». */
  meta?: React.ReactNode
}

export function PageHeader({
  actions,
  title,
  titleBadge,
  subtitle,
  breadcrumbs,
  backTo,
  icon: Icon,
  meta,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex animate-fade-in-up flex-col gap-1">
      {breadcrumbs && breadcrumbs.length > 1 && <PageBreadcrumb items={breadcrumbs} />}
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div className={cn('flex gap-3', Icon ? 'items-start gap-4' : 'items-center')}>
          {Icon && (
            <span className="grid size-11 shrink-0 place-content-center rounded-lg border border-border bg-sidebar">
              <Icon className="size-5 text-faint" aria-hidden="true" />
            </span>
          )}
          {backTo && (
            <Button variant="ghost" size="icon-sm" asChild className="-ml-1 shrink-0 text-muted-foreground">
              <Link to={backTo}>
                <ArrowLeft className="size-4" />
                <span className="sr-only">Retour</span>
              </Link>
            </Button>
          )}
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="font-display font-semibold text-3xl tracking-tight max-sm:text-2xl">{title}</h1>
              {titleBadge}
            </div>
            {subtitle && <p className="mt-0.5 text-muted-foreground text-sm">{subtitle}</p>}
            {meta && (
              <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-muted-foreground text-sm">{meta}</div>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 max-sm:w-full">{actions}</div>}
      </div>
    </div>
  )
}
