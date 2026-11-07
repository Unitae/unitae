import { Link } from 'react-router'

import type { AtRiskPioneers } from '~/features/dashboard/server/get-at-risk-pioneers.server'
import { DashboardSection } from '~/features/dashboard/ui/DashboardSection'
import * as m from '~/i18n/paraglide/messages'
import { formatGroupName } from '~/shared/utils/format-group-name'

/** Pioneers behind their yearly pace, for whoever follows the congregation's activity. */
export function PioneersAtRiskSection({ data }: { data: AtRiskPioneers }) {
  return (
    <DashboardSection
      title={m.dashboard_pioneers_at_risk_title({ count: String(data.count) })}
      link={{ to: '/publishers/activity/pioneers', label: m.dashboard_pioneers_at_risk_link() }}
    >
      {/* Columns so a long list stays short; the deficit hugs its own name so it can't be read
          as the next column's. */}
      <ul className="grid gap-x-6 gap-y-2.5 px-3.5 py-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.pioneers.map(pioneer => (
          <li key={pioneer.memberId} className="flex min-w-0 items-baseline gap-2 text-sm">
            <span className="min-w-0">
              <Link
                to={`/publishers/${pioneer.memberId}/view#activity`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {pioneer.firstname} {pioneer.lastname}
              </Link>
              {pioneer.groupName && (
                <span className="block truncate text-faint text-xs">{formatGroupName(pioneer.groupName)}</span>
              )}
            </span>
            <span className="shrink-0 font-medium text-danger-text tabular-nums">
              {m.dashboard_pioneers_at_risk_deficit({ hours: String(pioneer.deficit) })}
            </span>
          </li>
        ))}
      </ul>
    </DashboardSection>
  )
}
