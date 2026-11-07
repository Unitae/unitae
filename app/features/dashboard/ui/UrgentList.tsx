import { StatusIcon } from '@unitae/ui'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import type { UrgentItem, UrgentTone } from '~/features/dashboard/ui/build-urgent-items'
import { DashboardSection } from '~/features/dashboard/ui/DashboardSection'
import * as m from '~/i18n/paraglide/messages'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { cn } from '~/shared/utils/utils'

const TONE_ICON_CLASS: Record<UrgentTone, string> = {
  danger: 'text-danger-text',
  warning: 'text-warning-text',
  info: 'text-brand-text',
}

/**
 * « À traiter »: what needs the viewer's attention, most pressing first. Always shown, so an
 * empty list reads as good news instead of a missing block.
 */
export function UrgentList({ items }: { items: UrgentItem[] }) {
  return (
    <DashboardSection title={m.dashboard_urgent_section_title()} meta={items.length > 0 ? items.length : undefined}>
      {items.length === 0 ? (
        <p className="flex items-center gap-2.5 px-3.5 py-3 text-muted-foreground text-sm">
          <StatusIcon tone="success" />
          {m.dashboard_urgent_empty()}
        </p>
      ) : (
        <ul>
          {items.map(item => (
            <li key={item.key} className="border-border border-b last:border-b-0">
              <Link
                to={item.to}
                className="group flex items-start gap-3 px-3.5 py-2.5 outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <item.icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', TONE_ICON_CLASS[item.tone])} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium text-sm">{item.label}</span>
                  {item.relativeDate && (
                    <span className="text-faint text-xs">
                      <RelativeTime date={item.relativeDate} />
                    </span>
                  )}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-faint transition-transform duration-(--u-duration-fast) group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  )
}
