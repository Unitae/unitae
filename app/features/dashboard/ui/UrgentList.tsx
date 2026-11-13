import { StatusIcon } from '@unitae/ui'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import type { RankedUrgentItem } from '~/features/dashboard/ui/build-urgent-items'
import { DashboardSection } from '~/features/dashboard/ui/DashboardSection'
import * as m from '~/i18n/paraglide/messages'
import { RelativeTime } from '~/shared/ui/RelativeTime'

/** How many items show before the rest fold behind a button. */
const SHOWN = 5

/**
 * « À traiter »: the viewer's own items first, then those of their responsibilities, each with
 * where it comes from. Always shown, so an empty list reads as good news instead of a missing block.
 */
export function UrgentList({ items }: { items: RankedUrgentItem[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, SHOWN)
  const hidden = items.length - shown.length

  return (
    <DashboardSection title={m.dashboard_urgent_section_title()} meta={items.length > 0 ? items.length : undefined}>
      {items.length === 0 ? (
        <p className="flex items-center gap-2.5 px-3.5 py-3 text-muted-foreground text-sm">
          <StatusIcon tone="success" />
          {m.dashboard_urgent_empty()}
        </p>
      ) : (
        <>
          <ul>
            {shown.map(item => (
              <li key={item.key} className="border-border border-b last:border-b-0">
                <Link
                  to={item.to}
                  className="group flex items-start gap-3 px-3.5 py-2.5 outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {/* Neutral, as the board draws it: the label says how urgent (« en retard »), not the colour. */}
                  <item.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium text-sm">{item.label}</span>
                    <span className="text-faint text-xs">
                      {item.origin}
                      {item.relativeDate && (
                        <>
                          {' · '}
                          <RelativeTime date={item.relativeDate} />
                        </>
                      )}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-faint transition-transform duration-(--u-duration-fast) group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
          {(hidden > 0 || expanded) && items.length > SHOWN && (
            <button
              type="button"
              onClick={() => setExpanded(value => !value)}
              aria-expanded={expanded}
              className="w-full border-border border-t px-3.5 py-2 text-left font-medium text-brand-text text-xs outline-none transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              {expanded ? m.dashboard_urgent_show_less() : m.dashboard_urgent_show_more({ count: String(hidden) })}
            </button>
          )}
        </>
      )}
    </DashboardSection>
  )
}
