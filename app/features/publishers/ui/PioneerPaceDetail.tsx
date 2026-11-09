import { ChartLegend, ColumnChart, LineChart, seriesColor } from '@unitae/ui'

import { paceColumns, paceTotals } from '~/features/publishers/model/pioneer-chart-data'
import type { PioneerAnnualRow } from '~/features/publishers/model/pioneer-roster.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { cn } from '~/shared/utils/utils'

import { hoursText, projectionSentence } from './pioneer-pace-copy'

const DASHED = `repeating-linear-gradient(90deg, ${seriesColor(0)} 0 3px, transparent 3px 6px)`

function monthLabels(month: number, year: number) {
  const date = new Date(year, month, 1)
  const locale = getLocale()
  return {
    short: new Intl.DateTimeFormat(locale, { month: 'narrow' }).format(date),
    long: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date),
  }
}

/** The four figures of a pioneer's pace: done, owed to date, needed per month, recent rhythm. */
export function PaceFacts({ row, className }: { row: PioneerAnnualRow; className?: string }) {
  const { pace } = row
  const facts = [
    {
      value: hoursText(pace.achievedToDate),
      label:
        pace.creditToDate > 0
          ? m.pioneers_fact_done_with_credit({ credit: pace.creditToDate })
          : m.pioneers_fact_done(),
    },
    {
      value: hoursText(row.concluded ? pace.fullYearTarget : pace.targetToDate),
      label: row.concluded ? m.pioneers_fact_goal_adjusted() : m.pioneers_fact_goal_to_date(),
    },
    {
      value: row.concluded ? '—' : `≈ ${hoursText(pace.requiredAvgToFinish)}`,
      label: m.pioneers_fact_needed(),
    },
    { value: pace.reportedMonths > 0 ? hoursText(pace.recentAvg) : '—', label: m.pioneers_fact_recent() },
  ]
  return (
    <dl className={cn('grid grid-cols-2 overflow-hidden rounded-md border border-border', className)}>
      {facts.map((fact, index) => (
        <div
          key={fact.label}
          className={cn(
            'flex flex-col-reverse gap-0.5 px-3 py-2.5',
            index % 2 === 1 && 'border-border border-l',
            index >= 2 && 'border-border border-t',
          )}
        >
          <dt className="text-faint text-xs">{fact.label}</dt>
          <dd className="font-semibold text-lg tabular-nums">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Hours per month, the credit stacked on top, against the monthly goal; a missed month marked on the baseline. */
export function PaceMonthsChart({
  row,
  serviceYear,
  height = 150,
}: {
  row: PioneerAnnualRow
  serviceYear: number
  height?: number
}) {
  const columns = paceColumns(serviceYear, row.pace)
  const withCredit = row.pace.creditToDate > 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-medium text-sm">{m.pioneers_chart_months_title()}</div>
      {withCredit ? (
        <ChartLegend
          items={[
            { label: m.pioneers_chart_reported(), color: 'var(--color-chart-muted)' },
            { label: m.pioneers_chart_credit(), color: seriesColor(0) },
          ]}
        />
      ) : (
        <span className="text-faint text-xs">{m.pioneers_chart_goal_line({ goal: row.monthlyRate })}</span>
      )}
      <ColumnChart
        aria-label={m.pioneers_chart_months_aria({ goal: row.monthlyRate })}
        height={height}
        goal={{ value: row.monthlyRate, label: hoursText(row.monthlyRate) }}
        seriesLabels={{ value: m.pioneers_chart_reported(), stack: m.pioneers_chart_credit() }}
        gapLabels={{ missing: m.pioneers_chart_missing() }}
        formatTooltip={hoursText}
        yAxisWidth={32}
        data={columns.map(column => {
          const labels = monthLabels(column.month, column.year)
          return {
            key: column.key,
            label: labels.short,
            title: labels.long,
            value: column.state === 'reported' ? column.hours : column.state,
            stack: column.credit,
          }
        })}
      />
    </div>
  )
}

/** The year's running total against the goal month after month, and the projection to August. */
export function PaceTotalChart({
  row,
  serviceYear,
  height = 160,
}: {
  row: PioneerAnnualRow
  serviceYear: number
  height?: number
}) {
  const points = paceTotals(serviceYear, row.pace, row.monthlyRate, row.concluded)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-medium text-sm">{m.pioneers_chart_total_title()}</div>
      <ChartLegend
        items={[
          { label: m.pioneers_chart_total_done(), color: seriesColor(0), shape: 'line' },
          { label: m.pioneers_chart_total_goal(), color: 'var(--color-chart-context)', shape: 'line' },
          ...(row.concluded ? [] : [{ label: m.pioneers_chart_projection(), color: DASHED, shape: 'line' as const }]),
        ]}
      />
      <LineChart
        aria-label={projectionSentence(row, serviceYear)}
        height={height}
        xKey="label"
        yAxisWidth={40}
        formatValue={value => String(Math.round(value))}
        data={points.map(point => ({
          label: monthLabels(point.month, point.year).short,
          done: point.done,
          goal: point.goal,
          projection: point.projection,
        }))}
        series={[
          { key: 'goal', label: m.pioneers_chart_total_goal(), context: true },
          { key: 'done', label: m.pioneers_chart_total_done() },
          { key: 'projection', label: m.pioneers_chart_projection(), color: seriesColor(0), dashed: true },
        ]}
      />
      <p className="text-muted-foreground text-sm">{projectionSentence(row, serviceYear)}</p>
    </div>
  )
}
