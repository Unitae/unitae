import type { ActivityMonth } from './activity-months'
import { NEW_ARRIVAL_MONTHS } from './arrival'

/** What the group page shows for one month of a publisher's reports. */
export type ReportStatus = 'filed' | 'irregular' | 'not-filed' | 'not-expected'

const ordinal = ({ month, year }: ActivityMonth) => year * 12 + month

/**
 * A month's report status. A report always counts: with ministry it is filed, without it is
 * irregular (the activity pages' word for "did not preach"). Without one, the month is missing,
 * unless it came before the publisher was added (`expectedFrom`): nobody expected a report then.
 */
export function reportStatus(
  report: { isPublisher: boolean } | undefined,
  month: ActivityMonth,
  expectedFrom: ActivityMonth,
): ReportStatus {
  if (report) return report.isPublisher ? 'filed' : 'irregular'
  return ordinal(month) < ordinal(expectedFrom) ? 'not-expected' : 'not-filed'
}

/** Something about a publisher a group overseer may want to act on: a visit to plan, mostly. */
export type PastoralSignal =
  | { kind: 'inactive'; since: ActivityMonth }
  | { kind: 'new-arrival' }
  | { kind: 'baptism-anniversary' }
  | { kind: 'last-visit'; on: ActivityMonth }

const monthOf = (date: Date): ActivityMonth => ({ month: date.getMonth(), year: date.getFullYear() })
const monthsAfter = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, date.getDate())

/**
 * The pastoral signals for a publisher as of `now`. Dates are read from their local fields: pass
 * them through `zonedNow(timezone, date)` so they follow the congregation's calendar.
 * - inactive: since the month the flag was set;
 * - new arrival: for three months after arriving in the congregation (the welcome visit);
 * - baptism anniversary: from 11 to 13 months after the baptism, around the first anniversary;
 * - last visit: the month of the last pastoral visit, only when one was recorded.
 */
export function pastoralSignals(
  now: Date,
  member: {
    inactiveAt: Date | null
    baptismDate: Date | null
    arrivedAt: Date | null
    lastPastoralVisitAt: Date | null
  },
): PastoralSignal[] {
  const { inactiveAt, baptismDate, arrivedAt, lastPastoralVisitAt } = member
  const signals: PastoralSignal[] = []
  if (inactiveAt) signals.push({ kind: 'inactive', since: monthOf(inactiveAt) })
  if (arrivedAt && arrivedAt <= now && now < monthsAfter(arrivedAt, NEW_ARRIVAL_MONTHS)) {
    signals.push({ kind: 'new-arrival' })
  }
  if (baptismDate && now >= monthsAfter(baptismDate, 11) && now < monthsAfter(baptismDate, 13)) {
    signals.push({ kind: 'baptism-anniversary' })
  }
  if (lastPastoralVisitAt) signals.push({ kind: 'last-visit', on: monthOf(lastPastoralVisitAt) })
  return signals
}

/** A piece of emergency information a publisher is missing. */
export type EmergencyGap = 'card' | 'backpack' | 'contact'

export function emergencyGaps({
  dpaCardUpToDate,
  survivalBackpackReady,
  emergencyContactCount,
}: {
  dpaCardUpToDate: boolean
  survivalBackpackReady: boolean
  emergencyContactCount: number
}): EmergencyGap[] {
  const gaps: EmergencyGap[] = []
  if (!dpaCardUpToDate) gaps.push('card')
  if (!survivalBackpackReady) gaps.push('backpack')
  if (emergencyContactCount === 0) gaps.push('contact')
  return gaps
}
