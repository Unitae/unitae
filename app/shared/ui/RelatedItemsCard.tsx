import { ChevronRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { cn } from '~/shared/utils/utils'

interface RelatedItemsCardProps {
  title: string
  icon?: LucideIcon
  /** Total count of related records — shown as a badge next to the title. */
  count?: number
  /** Link to the owning feature's full list, rendered as a "Tout voir" action. */
  viewAllTo?: string
  /** Shown when there are no related records. */
  emptyLabel: string
  children?: React.ReactNode
  className?: string
}

/**
 * Cross-feature block on a record page (publisher, territory, event…):
 * a titled card listing the record's related items in another feature, each
 * row linking into that feature. Compose rows with `RelatedItemRow`.
 */
export function RelatedItemsCard({
  title,
  icon: Icon,
  count,
  viewAllTo,
  emptyLabel,
  children,
  className,
}: RelatedItemsCardProps) {
  const isEmpty = count === 0 || children == null

  return (
    <Card className={cn('gap-3', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
          {title}
          {count != null && count > 0 && (
            <Badge variant="secondary" className="px-2 text-xs">
              {count}
            </Badge>
          )}
        </CardTitle>
        {viewAllTo && !isEmpty && (
          <CardAction>
            <Link to={viewAllTo} className="text-primary text-sm hover:underline">
              {m.related_items_view_all()}
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-muted-foreground text-sm">{emptyLabel}</p>
        ) : (
          <ul className="flex flex-col">{children}</ul>
        )}
      </CardContent>
    </Card>
  )
}

interface RelatedItemRowProps {
  to: string
  /** Main line of the row. */
  primary: React.ReactNode
  /** Secondary muted line under the primary content. */
  secondary?: React.ReactNode
  /** Right-aligned slot (badge, date…), before the chevron. */
  trailing?: React.ReactNode
}

export function RelatedItemRow({ to, primary, secondary, trailing }: RelatedItemRowProps) {
  return (
    <li className="border-border/40 border-b last:border-0">
      <Link
        to={to}
        className="group -mx-2 flex min-h-[44px] items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-sm">{primary}</span>
          {secondary && <span className="truncate text-muted-foreground text-xs">{secondary}</span>}
        </span>
        {trailing && <span className="shrink-0">{trailing}</span>}
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    </li>
  )
}
