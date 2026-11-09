import { Status, type StatusTone } from '@unitae/ui'
import { MapPin } from 'lucide-react'
import { Link } from 'react-router'

import type { getUserTerritories, TerritoryStatus } from '~/features/dashboard/server/dashboard.server'
import { DashboardSection, PanelEmpty, PanelError, panelLinkRowClass } from '~/features/dashboard/ui/DashboardSection'
import * as m from '~/i18n/paraglide/messages'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { elapsedPercent } from '~/shared/utils/elapsed-percent'
import { cn } from '~/shared/utils/utils'

type Territories = Awaited<ReturnType<typeof getUserTerritories>>

const STATUS: Record<TerritoryStatus, { tone: StatusTone; label: () => string; bar: string }> = {
  'on-time': { tone: 'success', label: m.dashboard_territory_on_time, bar: 'bg-chart-1' },
  'due-soon': { tone: 'warning', label: m.dashboard_territory_due_soon, bar: 'bg-warning' },
  overdue: { tone: 'danger', label: m.dashboard_territory_overdue, bar: 'bg-danger' },
}

/** The viewer's territories, soonest due first, with how much of each loan period has gone. */
export function MyTerritoriesSection({ territories }: { territories: Territories | null }) {
  const hasItems = territories != null && territories.length > 0
  return (
    <DashboardSection
      title={m.dashboard_my_territories()}
      meta={hasItems ? territories.length : undefined}
      link={hasItems ? { to: '/me/territories', label: m.dashboard_territories_link() } : undefined}
    >
      {territories == null ? (
        <PanelError />
      ) : territories.length === 0 ? (
        <PanelEmpty
          icon={MapPin}
          title={m.dashboard_no_territories()}
          description={m.dashboard_empty_territories_guidance()}
        />
      ) : (
        <ul>
          {territories.map(t => {
            const status = STATUS[t.status]
            return (
              <li key={t.id} className="border-border border-b last:border-b-0">
                <Link to={`/me/territories/${t.territory.id}`} className={cn(panelLinkRowClass, 'border-b-0 py-2.5')}>
                  <span className="w-12 shrink-0 font-semibold text-sm tabular-nums">{t.territory.number}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-hover">
                      <span
                        className={cn('block h-full rounded-full', status.bar)}
                        style={{ width: `${elapsedPercent(t.startDate, t.lateDate)}%` }}
                      />
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2">
                      <Status tone={status.tone}>{status.label()}</Status>
                      <span className="text-faint text-xs">
                        <RelativeTime date={t.lateDate} />
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardSection>
  )
}
