import type { ActivityMonth } from './activity-months'

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
export type PastoralSignal = { kind: 'inactive'; since: ActivityMonth } | { kind: 'baptism-anniversary' }

/**
 * The pastoral signals for a publisher as of `now`. Dates are read from their local fields: pass
 * them through `zonedNow(timezone, date)` so they follow the congregation's calendar.
 * - inactive: since the month the flag was set;
 * - baptism anniversary: from 11 to 13 months after the baptism, around the first anniversary.
 */
export function pastoralSignals(
  now: Date,
  { inactiveAt, baptismDate }: { inactiveAt: Date | null; baptismDate: Date | null },
): PastoralSignal[] {
  const signals: PastoralSignal[] = []
  if (inactiveAt) {
    signals.push({ kind: 'inactive', since: { month: inactiveAt.getMonth(), year: inactiveAt.getFullYear() } })
  }
  if (baptismDate) {
    const after = (months: number) =>
      new Date(baptismDate.getFullYear(), baptismDate.getMonth() + months, baptismDate.getDate())
    if (now >= after(11) && now < after(13)) signals.push({ kind: 'baptism-anniversary' })
  }
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
