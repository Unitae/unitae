import { Map as MapIcon, Users } from 'lucide-react'
import { Link } from 'react-router'

import type { ManagementMetrics } from '~/features/dashboard/server/get-management-metrics.server'
import * as m from '~/i18n/paraglide/messages'
import { Card } from '~/shared/ui/card'
import { cn } from '~/shared/utils/utils'

interface MetricsRowProps {
  metrics: ManagementMetrics
}

/**
 * Compact congregation-wide counters for responsibility-holders, each tile
 * deep-linking into the feature where the number can be acted on.
 */
export function MetricsRow({ metrics }: MetricsRowProps) {
  const { territories, publishers } = metrics
  if (territories == null && publishers == null) return null

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {territories != null && (
        <MetricTile
          to="/territories"
          icon={MapIcon}
          value={territories.total}
          label={m.dashboard_metric_territories()}
          detail={m.dashboard_metric_territories_detail({
            assigned: String(territories.assigned),
            late: String(territories.late),
          })}
          alert={territories.late > 0}
        />
      )}
      {publishers != null && (
        <MetricTile
          to="/publishers"
          icon={Users}
          value={publishers.total}
          label={m.dashboard_metric_publishers()}
          detail={m.dashboard_metric_publishers_detail()}
        />
      )}
    </section>
  )
}

function MetricTile({
  to,
  icon: Icon,
  value,
  label,
  detail,
  alert = false,
}: {
  to: string
  icon: typeof Users
  value: number
  label: string
  detail: string
  alert?: boolean
}) {
  return (
    <Card className="gap-0 py-0 transition-shadow hover:shadow-md">
      <Link to={to} className="flex flex-col gap-1 px-4 py-3">
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider">
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </span>
        <span className="font-display font-semibold text-3xl tabular-nums tracking-tight">{value}</span>
        <span className={cn('truncate text-xs', alert ? 'text-destructive' : 'text-muted-foreground')}>{detail}</span>
      </Link>
    </Card>
  )
}
