import type { StatusTone } from '@unitae/ui'
import { lastIndexWhere, serviceYearMonths } from '~/features/publishers/model/pioneer-pace'
import type { PioneerAnnualRow } from '~/features/publishers/model/pioneer-roster.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'

// The words the roster, its panel and the publisher record use for one pioneer's pace, so the three say the same.

const RISK: Record<PioneerAnnualRow['pace']['riskBucket'], { tone: StatusTone; label: () => string }> = {
  red: { tone: 'danger', label: m.pioneers_risk_red },
  amber: { tone: 'warning', label: m.pioneers_risk_amber },
  green: { tone: 'success', label: m.pioneers_status_on_time },
}

const number = (value: number) => new Intl.NumberFormat(getLocale()).format(Math.round(value))

/** « 1 368 h », in the reader's language. */
export const hoursText = (value: number) => m.activity_hours_value({ hours: number(value) })

const monthName = (month: number, year: number) =>
  new Intl.DateTimeFormat(getLocale(), { month: 'long' }).format(new Date(year, month, 1))

/** Late, at risk or on time; nothing for a stint that ended (its tag says so). */
export function paceStatus(row: PioneerAnnualRow): { tone: StatusTone; label: string } | null {
  if (row.concluded) return null
  const risk = RISK[row.pace.riskBucket]
  return { tone: risk.tone, label: risk.label() }
}

/** The line under the status: how far ahead or behind, and what it takes to finish; empty when exactly on pace. */
export function paceLine(row: PioneerAnnualRow): string {
  const { pace } = row
  if (row.concluded) {
    return m.pioneers_line_concluded({ done: number(pace.achievedToDate), goal: number(pace.fullYearTarget) })
  }
  if (pace.paceDelta < 0) {
    const behind = number(-pace.paceDelta)
    return pace.outOfReach
      ? m.pioneers_line_behind_out_of_reach({ hours: behind })
      : m.pioneers_line_behind({ hours: behind, need: number(pace.requiredAvgToFinish) })
  }
  return pace.paceDelta > 0 ? m.pioneers_pace_ahead({ hours: number(pace.paceDelta) }) : ''
}

/** The month of the overdue report, e.g. « Rapport en retard pour février »; nothing while none is overdue. */
export function overdueLabel(row: PioneerAnnualRow, serviceYear: number): string | null {
  if (row.concluded || row.pace.reportingStatus !== 'overdue') return null
  const index = lastIndexWhere(row.pace.monthStates, state => state !== 'future')
  const month = serviceYearMonths(serviceYear)[index]
  return month ? m.pioneers_overdue_for({ month: monthName(month.month, month.year) }) : m.pioneers_report_overdue()
}

/** When the enrolment began this year, if not in September: « inscription en février ». */
export function enrolmentStart(row: PioneerAnnualRow, serviceYear: number): string | null {
  const index = row.pace.monthStates.findIndex(state => state !== 'off')
  const month = index > 0 ? serviceYearMonths(serviceYear)[index] : undefined
  return month ? m.pioneers_enrolled_in({ month: monthName(month.month, month.year) }) : null
}

/** Under the name: the group, then the enrolment's start, the months enrolled, or that it ended. */
export function rosterSubline(row: PioneerAnnualRow, serviceYear: number, groupName: string | null): string {
  const enrolment = row.concluded
    ? m.pioneers_concluded_short()
    : (enrolmentStart(row, serviceYear) ?? m.pioneers_enrolled_months({ count: String(row.pace.elapsedEnrolled) }))
  return groupName ? `${groupName} · ${enrolment}` : enrolment
}

/** The sentence under the year's running total. */
export function projectionSentence(row: PioneerAnnualRow, serviceYear: number): string {
  const { pace } = row
  if (row.concluded) return m.pioneers_projection_concluded()
  if (pace.reportedMonths === 0) {
    const start = row.pace.monthStates.findIndex(state => state !== 'off')
    const month = serviceYearMonths(serviceYear)[Math.max(start, 0)]
    return m.pioneers_projection_no_report({
      month: month ? monthName(month.month, month.year) : '',
      left: number(Math.max(pace.fullYearTarget - pace.achievedToDate, 0)),
      need: number(pace.requiredAvgToFinish),
    })
  }
  return m.pioneers_projection_recent({ projected: number(pace.projectedYearEnd), goal: number(pace.fullYearTarget) })
}

/** « 2 en février · 10 depuis septembre », or that no report came in yet. */
export function studiesLine(row: PioneerAnnualRow, serviceYear: number): string {
  const { pace } = row
  const last = lastIndexWhere(pace.monthStates, state => state === 'reported')
  if (last < 0) return m.pioneers_studies_none()
  const month = serviceYearMonths(serviceYear)[last]
  const total = pace.monthlyStudies.reduce<number>((sum, studies) => sum + (studies ?? 0), 0)
  return m.pioneers_studies_line({
    last: pace.monthlyStudies[last] ?? 0,
    month: month ? monthName(month.month, month.year) : '',
    total,
  })
}
