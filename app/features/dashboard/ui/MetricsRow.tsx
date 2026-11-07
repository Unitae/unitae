import { MetricStrip, StatTile } from '@unitae/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import type { ManagementMetrics } from '~/features/dashboard/server/get-management-metrics.server'
import { formatShare } from '~/features/dashboard/ui/dashboard-format'
import * as m from '~/i18n/paraglide/messages'

interface MetricsRowProps {
  metrics: ManagementMetrics
}

/**
 * Whether the row has anything to say: on a congregation still being set up, a row of zeros only
 * repeats the "Premiers pas" checklist. One non-zero counter is enough to show them all.
 */
export function hasMetricsToShow({ territories, publishers }: ManagementMetrics): boolean {
  return (territories != null && territories.total > 0) || (publishers != null && publishers.total > 0)
}

/**
 * Congregation-wide counters for responsibility-holders, in one strip. Each tile deep-links into
 * the page where the number can be acted on.
 */
export function MetricsRow({ metrics }: MetricsRowProps) {
  const { territories, publishers } = metrics
  if (territories == null && publishers == null) return null

  return (
    <MetricStrip aria-label={m.dashboard_metrics_label()} className="overflow-hidden">
      {publishers != null && (
        <MetricLink to="/publishers">
          <StatTile label={m.dashboard_metric_publishers()} value={publishers.total} />
        </MetricLink>
      )}
      {territories != null && (
        <>
          <MetricLink to="/territories/attributions">
            <StatTile
              label={m.dashboard_metric_territories_out()}
              value={territories.assigned}
              unit={`/ ${territories.total}`}
              foot={m.dashboard_metric_territories_share({
                share: formatShare(territories.assigned, territories.total),
              })}
            />
          </MetricLink>
          <MetricLink to="/territories/attributions">
            <StatTile
              label={m.dashboard_territory_overdue()}
              value={territories.late}
              foot={m.dashboard_metric_late_foot()}
              tone={territories.late > 0 ? 'warning' : 'neutral'}
            />
          </MetricLink>
        </>
      )}
    </MetricStrip>
  )
}

function MetricLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="block min-w-0 outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      {children}
    </Link>
  )
}
