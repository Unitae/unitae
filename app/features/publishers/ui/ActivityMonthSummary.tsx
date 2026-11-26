import { MetricStrip, ProgressBar, StatTile } from '@unitae/ui'

import type { BranchLine, GroupProgress, ReportMonthSummary } from '~/features/publishers/model/report-month'
import * as m from '~/i18n/paraglide/messages'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { cn } from '~/shared/utils/utils'

/** « 95 h · 4 cours bibliques »: what a line adds up to beside its number of reports. */
function lineFoot({ hours, studies }: Partial<Pick<BranchLine, 'hours'>> & Pick<BranchLine, 'studies'>): string {
  const studiesText = m.activity_summary_studies_count({ count: studies })
  return hours == null ? studiesText : `${m.activity_hours_value({ hours })} · ${studiesText}`
}

/**
 * The month's figures as the branch asks for them, the congregation's total first, then one tile per line: reports
 * first, then hours and Bible studies. Above the list and its panel so the strip keeps the page's full width.
 */
export function ActivityMonthSummary({ summary }: { summary: ReportMonthSummary }) {
  const { publishers, auxiliary, regular, congregation } = summary.branch
  return (
    <MetricStrip aria-label={m.activity_summary_label()} minTileWidth={150}>
      <StatTile
        label={m.activity_summary_congregation_label()}
        value={congregation.reports}
        unit={
          congregation.irregular > 0
            ? `${m.activity_summary_reports_unit({ count: congregation.reports })}, ${m.activity_summary_irregular({ count: congregation.irregular })}`
            : m.activity_summary_reports_unit({ count: congregation.reports })
        }
        foot={lineFoot(congregation)}
      />
      <StatTile
        label={m.activity_summary_publishers_label()}
        value={publishers.reports}
        unit={m.activity_summary_reports_unit({ count: publishers.reports })}
        foot={lineFoot(publishers)}
      />
      <StatTile
        label={m.activity_summary_auxiliary_label()}
        value={auxiliary.reports}
        unit={m.activity_summary_reports_unit({ count: auxiliary.reports })}
        foot={lineFoot(auxiliary)}
      />
      <StatTile
        label={m.activity_summary_regular_label()}
        value={regular.reports}
        unit={m.activity_summary_reports_unit({ count: regular.reports })}
        foot={lineFoot(regular)}
      />
    </MetricStrip>
  )
}

interface GroupStripProps {
  groups: GroupProgress[]
  selectedId: number | null
  onSelect: (groupId: number | null) => void
}

/** Reports in per group; choosing one filters the list, choosing it again shows everyone. */
export function ActivityGroupStrip({ groups, selectedId, onSelect }: GroupStripProps) {
  if (groups.length < 2) return null
  return (
    <section aria-labelledby="activity-by-group" className="flex flex-col gap-2 max-lg:hidden">
      <div className="flex items-baseline gap-2">
        <h2 id="activity-by-group" className="font-medium text-sm">
          {m.activity_groups_title()}
        </h2>
        <span className="text-faint text-xs">{m.activity_groups_hint()}</span>
      </div>
      <div
        className="grid overflow-hidden rounded-lg border border-border bg-card [&>*+*]:border-border [&>*+*]:border-l"
        style={{ gridTemplateColumns: `repeat(${Math.min(groups.length, 6)}, minmax(0, 1fr))` }}
      >
        {groups.map(group => {
          const pressed = group.id === selectedId
          return (
            <button
              key={group.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => onSelect(pressed ? null : group.id)}
              className={cn(
                'flex flex-col gap-2 px-4 pt-2.5 pb-3 text-left outline-none transition-colors duration-(--u-duration-fast) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                pressed ? 'bg-selected' : 'hover:bg-hover',
              )}
            >
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{formatGroupName(group.name)}</span>
                <span className="text-faint tabular-nums">
                  {group.filed} / {group.expected}
                </span>
              </span>
              <ProgressBar
                value={group.filed}
                max={group.expected}
                tone={group.filed === group.expected ? 'success' : 'accent'}
              />
            </button>
          )
        })}
      </div>
    </section>
  )
}
