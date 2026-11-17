import {
  ChartCard,
  chartContext,
  LineChart,
  MetricStrip,
  SegmentedControl,
  StatTile,
  type StatTone,
  seriesColor,
} from '@unitae/ui'
import { useState } from 'react'

import {
  type AveragedKind,
  attendanceChart,
  attendanceMetrics,
  type Measure,
  type OverviewMeeting,
} from '~/features/events/model/attendance-overview'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'

interface AttendanceOverviewProps {
  meetings: OverviewMeeting[]
  previous: OverviewMeeting[]
  serviceYear: number
  today: string
  now: Date
  timeZone: string
}

const yearLabel = (serviceYear: number) => `${serviceYear}–${serviceYear + 1}`

/** « +5 % », « −3 % »: the change from last year's figure, whole percent. */
function delta(current: number, previous: number): { text: string; tone: StatTone } {
  const change = Math.round(((current - previous) / previous) * 100)
  if (change === 0) return { text: '0 %', tone: 'neutral' }
  return { text: `${change > 0 ? '+' : '−'}${Math.abs(change)} %`, tone: change > 0 ? 'positive' : 'negative' }
}

function AverageTile({ label, average, previous }: { label: string; average: number | null; previous: number | null }) {
  const compared = average != null && previous != null && previous > 0 ? delta(average, previous) : null
  return (
    <StatTile
      label={label}
      value={average ?? '—'}
      foot={
        compared
          ? m.attendance_metric_vs({ delta: compared.text, previous: String(previous) })
          : m.attendance_metric_no_previous()
      }
      tone={compared?.tone ?? 'neutral'}
    />
  )
}

const percent = (share: number | null) => (share == null ? null : Math.round(share * 100))

/**
 * The service year at a glance: each kind's average against the same months last year, the online share and the
 * meetings still to complete; then the monthly averages, the year shown over the one before, by kind and count.
 */
export function AttendanceOverview({ meetings, previous, serviceYear, today, now, timeZone }: AttendanceOverviewProps) {
  const [kind, setKind] = useState<AveragedKind>('weekend')
  const [measure, setMeasure] = useState<Measure>('total')
  const metrics = attendanceMetrics({ meetings, previous, serviceYear, today, now, timeZone })
  const points = attendanceChart({ meetings, previous, serviceYear, kind, measure })
  const monthName = new Intl.DateTimeFormat(getLocale(), { month: 'short', timeZone: 'UTC' })
  const label = (month: number) => monthName.format(new Date(Date.UTC(2026, month, 1)))
  const share = percent(metrics.onlineShare.current)
  const shareBefore = percent(metrics.onlineShare.previous)
  const kindLong = kind === 'midweek' ? m.attendance_kind_midweek_full() : m.attendance_kind_weekend_full()
  const measureLong = {
    total: m.attendance_measure_total_long,
    inPerson: m.attendance_measure_in_person_long,
    online: m.attendance_measure_online_long,
  }[measure]()

  return (
    <>
      <MetricStrip aria-label={m.attendance_metrics()} minTileWidth={200}>
        <AverageTile label={m.attendance_metric_midweek()} {...metrics.midweek} />
        <AverageTile label={m.attendance_metric_weekend()} {...metrics.weekend} />
        <StatTile
          label={m.attendance_metric_online()}
          value={share ?? '—'}
          unit={share == null ? undefined : '%'}
          foot={
            shareBefore == null
              ? m.attendance_metric_online_foot_alone()
              : m.attendance_metric_online_foot({ previous: `${shareBefore} %` })
          }
        />
        <StatTile
          label={m.attendance_metric_entered()}
          value={metrics.entered.complete}
          unit={m.attendance_metric_held({ count: metrics.entered.held })}
          foot={
            metrics.entered.toComplete > 0
              ? m.attendance_metric_to_complete({ count: metrics.entered.toComplete })
              : m.attendance_metric_all_entered()
          }
          tone={metrics.entered.toComplete > 0 ? 'warning' : 'neutral'}
        />
      </MetricStrip>

      <ChartCard
        title={m.attendance_chart_title()}
        subtitle={m.attendance_chart_subtitle({ kind: kindLong, measure: measureLong })}
        legend={[
          { label: yearLabel(serviceYear), color: seriesColor(0), shape: 'line' },
          { label: yearLabel(serviceYear - 1), color: chartContext, shape: 'line' },
        ]}
        viewLabels={{
          chart: m.attendance_chart_chart(),
          table: m.attendance_chart_table(),
          group: m.attendance_chart_view(),
        }}
        table={{
          columns: [
            { key: 'month', label: m.attendance_col_month() },
            { key: 'count', label: m.attendance_col_meetings(), numeric: true },
            { key: 'current', label: yearLabel(serviceYear), numeric: true },
            { key: 'previous', label: yearLabel(serviceYear - 1), numeric: true },
          ],
          rows: points.map(point => ({
            month: label(point.month),
            count: point.count > 0 ? point.count : '',
            current: point.current ?? '—',
            previous: point.previous ?? '—',
          })),
        }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              aria-label={m.attendance_kind_group()}
              value={kind}
              onValueChange={setKind}
              options={[
                { value: 'midweek', label: m.attendance_kind_midweek() },
                { value: 'weekend', label: m.attendance_kind_weekend() },
              ]}
            />
            <SegmentedControl
              size="sm"
              aria-label={m.attendance_measure_group()}
              value={measure}
              onValueChange={setMeasure}
              options={[
                { value: 'total', label: m.attendance_measure_total() },
                { value: 'inPerson', label: m.attendance_measure_in_person() },
                { value: 'online', label: m.attendance_measure_online() },
              ]}
            />
          </div>
        }
      >
        <LineChart
          aria-label={m.attendance_chart_aria({ kind: kindLong })}
          data={points.map(point => ({ month: label(point.month), current: point.current, previous: point.previous }))}
          xKey="month"
          series={[
            { key: 'current', label: yearLabel(serviceYear), area: true },
            { key: 'previous', label: yearLabel(serviceYear - 1), context: true },
          ]}
          height={200}
          endLabel
        />
      </ChartCard>
    </>
  )
}
