import { MetricStrip, ProgressBar, StatTile } from '@unitae/ui'

import type { GroupProgress, ReportMonthSummary } from '~/features/publishers/model/report-month'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { cn } from '~/shared/utils/utils'

/** One message for one, another for more, as the catalogues pair them. */
const plural = (count: number, one: () => string, other: (input: { count: number }) => string) =>
  count === 1 ? one() : other({ count })

const PIONEER_PARTS: { type: PublisherType; label: (count: number) => string }[] = [
  {
    type: PublisherType.PionnierPermanant,
    label: count =>
      plural(count, m.activity_summary_pioneers_permanent_one, m.activity_summary_pioneers_permanent_other),
  },
  {
    type: PublisherType.PionnierAuxiliaires,
    label: count =>
      plural(count, m.activity_summary_pioneers_auxiliary_one, m.activity_summary_pioneers_auxiliary_other),
  },
  {
    type: PublisherType.PionnierSpecial,
    label: count => plural(count, m.activity_summary_pioneers_special_one, m.activity_summary_pioneers_special_other),
  },
  {
    type: PublisherType.Missionnaire,
    label: count =>
      plural(count, m.activity_summary_pioneers_missionary_one, m.activity_summary_pioneers_missionary_other),
  },
]

/** « 8 pionniers · 6 permanents, 2 auxiliaires »: the services in the month's reports. */
function pioneersFoot(summary: ReportMonthSummary): string {
  if (summary.pioneers === 0) return m.activity_summary_pioneers_none()
  const parts = PIONEER_PARTS.flatMap(({ type, label }) => {
    const count = summary.pioneersByType[type] ?? 0
    return count > 0 ? [label(count)] : []
  })
  const total = plural(summary.pioneers, m.activity_summary_pioneers_count_one, m.activity_summary_pioneers_count_other)
  return `${total} · ${parts.join(', ')}`
}

/** The month at a glance, above the list and its panel so the strip keeps the page's full width. */
export function ActivityMonthSummary({ summary }: { summary: ReportMonthSummary }) {
  return (
    <MetricStrip aria-label={m.activity_summary_label()} minTileWidth={150}>
      <StatTile
        label={m.activity_summary_filed_label()}
        value={summary.filed}
        unit={plural(summary.expected, m.activity_summary_filed_unit_one, m.activity_summary_filed_unit_other)}
        meter={<ProgressBar value={summary.filed} max={summary.expected} />}
        foot={
          summary.missing > 0 ? m.activity_summary_missing({ count: summary.missing }) : m.activity_summary_all_filed()
        }
        tone={summary.missing > 0 ? 'warning' : 'positive'}
      />
      <StatTile
        label={m.activity_summary_preached_label()}
        value={summary.preached}
        foot={
          summary.notPreached > 0
            ? plural(summary.notPreached, m.activity_summary_not_preached_one, m.activity_summary_not_preached_other)
            : m.activity_summary_everyone_preached()
        }
      />
      <StatTile
        label={m.activity_summary_pioneer_hours_label()}
        value={summary.pioneerHours}
        unit={m.activity_hours_unit()}
        foot={pioneersFoot(summary)}
      />
      <StatTile
        label={m.activity_summary_studies_label()}
        value={summary.studies}
        foot={
          summary.pioneerStudies > 0 ? m.activity_summary_pioneer_studies({ count: summary.pioneerStudies }) : undefined
        }
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
