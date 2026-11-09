import { MetricStrip, ProgressBar, SegmentedBar, StatTile, Status } from '@unitae/ui'

import type { PioneerActivitySummary } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'

import { hoursText } from './pioneer-pace-copy'

/** The roster at a glance: how the annual pioneers stand, their hours against the goals to date, the auxiliaries. */
export function PioneerSummary({ summary }: { summary: PioneerActivitySummary }) {
  const { totals, auxiliary } = summary
  const active = totals.onTrack + totals.behind + totals.atRisk
  const permanentAuxiliaries = auxiliary.filter(row => row.permanent).length

  return (
    <MetricStrip aria-label={m.pioneers_summary_label()} minTileWidth={230}>
      {active > 0 && (
        <div className="flex min-w-0 flex-col gap-2 px-4 py-4">
          <span className="font-medium text-muted-foreground text-sm">{m.pioneers_summary_rhythm()}</span>
          <SegmentedBar
            aria-label={m.pioneers_summary_rhythm()}
            showLegend={false}
            className="[&>[role=img]]:h-2.5 [&>[role=img]_span]:text-[0px]"
            parts={[
              { key: 'red', label: m.pioneers_risk_red(), value: totals.atRisk, color: 'var(--color-danger)' },
              { key: 'amber', label: m.pioneers_risk_amber(), value: totals.behind, color: 'var(--color-warning)' },
              {
                key: 'green',
                label: m.pioneers_status_on_time(),
                value: totals.onTrack,
                color: 'var(--color-success)',
              },
            ]}
          />
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Status tone="danger">{m.pioneers_count_late({ count: totals.atRisk })}</Status>
            <Status tone="warning">{m.pioneers_count_at_risk({ count: totals.behind })}</Status>
            <Status tone="success">{m.pioneers_count_on_time({ count: totals.onTrack })}</Status>
          </span>
          {totals.concluded > 0 && (
            <span className="text-faint text-xs">
              {totals.concluded === 1
                ? m.pioneers_summary_concluded_one()
                : m.pioneers_summary_concluded_other({ count: totals.concluded })}
            </span>
          )}
        </div>
      )}
      {active > 0 && (
        <StatTile
          label={m.pioneers_summary_hours()}
          value={hoursText(totals.actualHours)}
          meter={<ProgressBar value={totals.actualHours} max={totals.targetToDate} />}
          foot={
            totals.creditHours > 0
              ? m.pioneers_summary_hours_foot_credit({
                  goal: hoursText(totals.targetToDate),
                  credit: hoursText(totals.creditHours),
                  year: hoursText(totals.targetHours),
                })
              : m.pioneers_summary_hours_foot({
                  goal: hoursText(totals.targetToDate),
                  year: hoursText(totals.targetHours),
                })
          }
        />
      )}
      <StatTile
        label={m.pioneers_section_auxiliary()}
        value={auxiliary.length}
        foot={auxiliary.length > 0 ? m.pioneers_summary_auxiliary_foot({ count: permanentAuxiliaries }) : undefined}
      />
    </MetricStrip>
  )
}
