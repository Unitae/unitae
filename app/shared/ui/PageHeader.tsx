import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '~/shared/ui/button'
import { type BreadcrumbEntry, PageBreadcrumb } from '~/shared/ui/PageBreadcrumb'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  breadcrumbs?: BreadcrumbEntry[]
  backTo?: string
}

export function PageHeader({ actions, title, subtitle, breadcrumbs, backTo }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      {breadcrumbs && breadcrumbs.length > 1 && <PageBreadcrumb items={breadcrumbs} />}
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div className="flex items-center gap-3">
          {backTo && (
            <Button variant="ghost" size="icon-sm" asChild className="-ml-1 shrink-0 text-muted-foreground">
              <Link to={backTo}>
                <ArrowLeft className="size-4" />
                <span className="sr-only">Retour</span>
              </Link>
            </Button>
          )}
          <div>
            <h1 className="font-display font-semibold text-2xl tracking-tight max-sm:text-xl">{title}</h1>
            {subtitle && <p className="mt-0.5 text-muted-foreground text-sm">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 max-sm:w-full">{actions}</div>}
      </div>
    </div>
  )
}
