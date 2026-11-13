import { StatusIcon } from '@unitae/ui'
import { PenLine } from 'lucide-react'
import { Link } from 'react-router'

import type { GroupSummary } from '~/features/dashboard/model/group-summary'
import { DashboardSection, PanelError, PanelFact, SectionAction } from '~/features/dashboard/ui/DashboardSection'
import { formatActivityMonth } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'

const SHOWN_MISSING = 3

type GroupBlock = { data: (GroupSummary & { canRecord: boolean }) | null }

/**
 * « Mon groupe », for its overseer and assistant: the month's reports, the visits to plan and
 * what is missing in the emergency roster, from the same data as the group page. Rows with
 * nothing to act on are left out.
 */
export function GroupSection({ group }: { group: GroupBlock }) {
  const data = group.data
  if (data == null) {
    return (
      <DashboardSection title={m.groups_meta_title()}>
        <PanelError />
      </DashboardSection>
    )
  }
  const locale = getLocale()
  const month = data.month
  const missing = data.reports.missing
  const names = missing.slice(0, SHOWN_MISSING).map(p => formatPersonName(p))
  const extra = missing.length - names.length

  return (
    <DashboardSection
      title={formatGroupName(data.name)}
      meta={m.dashboard_group_members({ count: data.memberCount })}
      link={{ to: `/groups/${data.id}/view`, label: m.dashboard_group_link() }}
      actions={
        data.canRecord && month != null && missing.length > 0 ? (
          <SectionAction
            to={`/publishers/activity/new?month=${month.month}&year=${month.year}`}
            icon={PenLine}
            label={m.dashboard_group_record()}
          />
        ) : undefined
      }
    >
      {month != null && data.reports.expected > 0 && (
        <PanelFact
          label={m.dashboard_reports_label({ month: formatActivityMonth(month, locale, 'long') })}
          value={`${data.reports.received} / ${data.reports.expected}`}
          detail={
            missing.length > 0 ? (
              m.dashboard_group_reports_missing({
                names: extra > 0 ? `${names.join(', ')} +${extra}` : names.join(', '),
              })
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <StatusIcon tone="success" />
                {m.dashboard_group_reports_all_in()}
              </span>
            )
          }
        />
      )}
      {data.newArrivals > 0 && <PanelFact label={m.dashboard_group_new_arrivals()} value={data.newArrivals} />}
      {data.anniversaries > 0 && <PanelFact label={m.dashboard_group_anniversaries()} value={data.anniversaries} />}
      {data.inactive.count > 0 && (
        <PanelFact
          label={m.dashboard_group_inactive()}
          value={data.inactive.count}
          detail={
            data.inactive.since
              ? m.dashboard_group_inactive_since({ month: formatActivityMonth(data.inactive.since, locale, 'long') })
              : undefined
          }
        />
      )}
      {data.incompleteEmergency > 0 && (
        <PanelFact
          label={m.dashboard_group_emergency()}
          value={data.incompleteEmergency}
          action={
            <Link
              to={`/publishers/emergency-roster/${data.id}`}
              className="shrink-0 font-medium text-brand-text text-xs underline-offset-4 hover:underline"
            >
              {m.dashboard_group_emergency_link()}
            </Link>
          }
        />
      )}
    </DashboardSection>
  )
}
