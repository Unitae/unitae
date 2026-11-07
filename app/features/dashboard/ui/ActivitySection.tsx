import { PenLine } from 'lucide-react'
import { Link } from 'react-router'

import type { DashboardVisibility } from '~/features/dashboard/model/dashboard-visibility'
import type { AtRiskPioneers } from '~/features/dashboard/server/get-at-risk-pioneers.server'
import type { ReportProgress } from '~/features/dashboard/server/get-report-progress.server'
import { DashboardSection, PanelError, PanelFact, SectionAction } from '~/features/dashboard/ui/DashboardSection'
import { formatActivityMonth } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { formatGroupName } from '~/shared/utils/format-group-name'

interface ActivitySectionProps {
  activity: { progress: { data: ReportProgress | null }; pioneers: AtRiskPioneers | null }
  rights: NonNullable<DashboardVisibility['activity']>
}

/**
 * « Activité », for whoever follows the congregation's reports: the month being collected, and
 * the pioneers behind their yearly pace. Names and links appear only where the viewer may open
 * the page behind them.
 */
export function ActivitySection({ activity, rights }: ActivitySectionProps) {
  const progress = activity.progress.data
  const pioneers = activity.pioneers
  return (
    <DashboardSection
      title={m.dashboard_activity_title()}
      link={rights.canOpenPioneers ? { to: '/publishers/activity', label: m.dashboard_activity_link() } : undefined}
      actions={
        rights.canRecord ? (
          <SectionAction
            to={
              progress
                ? `/publishers/activity/new?month=${progress.month.month}&year=${progress.month.year}`
                : '/publishers/activity/new'
            }
            icon={PenLine}
            label={m.dashboard_activity_record()}
          />
        ) : undefined
      }
    >
      {progress == null ? (
        <PanelError />
      ) : (
        <PanelFact
          label={m.dashboard_reports_label({ month: formatActivityMonth(progress.month, getLocale(), 'long') })}
          value={`${progress.received} / ${progress.expected}`}
          detail={reportsDetail(progress)}
        />
      )}
      {pioneers != null && pioneers.count > 0 && (
        <div className="border-border border-b px-3.5 py-3 last:border-b-0">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-sm">{m.dashboard_pioneers_at_risk_title({ count: String(pioneers.count) })}</span>
            <span className="flex-1" />
            {rights.canOpenPioneers && (
              <Link
                to="/publishers/activity/pioneers"
                className="font-medium text-brand-text text-xs underline-offset-4 hover:underline"
              >
                {m.dashboard_pioneers_at_risk_link()}
              </Link>
            )}
          </div>
          {/* The deficit hugs its own name so it can't be read as the next column's. */}
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {pioneers.pioneers.map(pioneer => (
              <li key={pioneer.memberId} className="flex min-w-0 items-baseline gap-2 text-sm">
                <span className="min-w-0">
                  {rights.canOpenPublisher ? (
                    <Link
                      to={`/publishers/${pioneer.memberId}/view#activity`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {pioneer.firstname} {pioneer.lastname}
                    </Link>
                  ) : (
                    <span className="font-medium">
                      {pioneer.firstname} {pioneer.lastname}
                    </span>
                  )}
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
        </div>
      )}
    </DashboardSection>
  )
}

/**
 * What is still missing, then last month for comparison. Text only, no curve: the month being
 * collected fills up as reports arrive, so it would read as a drop at the start of every month.
 */
function reportsDetail(progress: ReportProgress): string | undefined {
  const parts: string[] = []
  if (progress.incompleteGroups > 0) {
    parts.push(m.dashboard_activity_incomplete_groups({ count: String(progress.incompleteGroups) }))
  }
  const previous = progress.previous
  if (previous.expected > 0) {
    parts.push(
      m.dashboard_reports_previous({
        received: String(previous.received),
        expected: String(previous.expected),
        month: formatActivityMonth(previous.month, getLocale(), 'long'),
      }),
    )
  }
  return parts.length > 0 ? parts.join(' · ') : undefined
}
