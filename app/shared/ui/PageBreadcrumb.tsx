import { ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { type BreadcrumbEntry, trailFor } from '~/shared/ui/page-trail'
import { cn } from '~/shared/utils/utils'

export type { BreadcrumbEntry }

/**
 * The page's trail, on one line. From md up it ends with the page itself, in ink.
 * On a phone the title sits right below, so only the ancestors show, as the way back.
 */
export function PageBreadcrumb({ items, className }: { items: BreadcrumbEntry[]; className?: string }) {
  const { pathname } = useLocation()
  const trail = trailFor(pathname, items)
  const last = trail.length - 1

  return (
    <nav aria-label={m.page_trail_aria_label()} className={cn('min-w-0', last === 0 && 'max-md:hidden', className)}>
      <ol className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-sm">
        {trail.map((item, index) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: a trail may repeat a label; its order never changes
            key={index}
            className={cn(
              'flex min-w-0 items-center gap-1.5',
              index === last ? 'max-md:hidden' : 'max-w-48 shrink-0 max-md:shrink',
            )}
          >
            {index > 0 && <ChevronRight className="size-3.5 shrink-0 text-faint" aria-hidden="true" />}
            <TrailItem item={item} current={index === last} />
          </li>
        ))}
      </ol>
    </nav>
  )
}

function TrailItem({ item, current }: { item: BreadcrumbEntry; current: boolean }) {
  if (current) {
    return (
      <span aria-current="page" className="truncate font-medium text-foreground">
        {item.label}
      </span>
    )
  }
  if (item.to) {
    return (
      <Link to={item.to} className="truncate text-muted-foreground transition-colors hover:text-foreground">
        {item.label}
      </Link>
    )
  }
  return <span className="truncate text-muted-foreground">{item.label}</span>
}
