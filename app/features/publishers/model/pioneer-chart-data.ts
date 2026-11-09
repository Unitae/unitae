// The pace charts' rows, from one pioneer's pace: a column per month of the service year, and the year's running total
// against the goal with the projection to August. Pure, so the roster panel and the publisher record draw the same.

import { lastIndexWhere, type PaceMonthState, type PioneerPace, serviceYearMonths } from './pioneer-pace'

export interface PaceColumn {
  key: string
  month: number
  year: number
  state: PaceMonthState
  hours: number
  credit: number
}

export interface PaceTotalPoint {
  key: string
  month: number
  year: number
  /** Hours and credit added up to this month; null once the months to come begin. */
  done: number | null
  /** What the goal adds up to by this month; null before the enrolment starts. */
  goal: number | null
  /** At the recent rhythm, from the last month done to August; null before it, and for a stint that ended. */
  projection: number | null
}

const keyOf = (month: number, year: number) => `${year}-${String(month + 1).padStart(2, '0')}`

export function paceColumns(serviceYear: number, pace: PioneerPace): PaceColumn[] {
  return serviceYearMonths(serviceYear).map(({ month, year }, index) => ({
    key: keyOf(month, year),
    month,
    year,
    state: pace.monthStates[index] ?? 'future',
    hours: pace.monthlyHours[index] ?? 0,
    credit: pace.monthlyCredits[index] ?? 0,
  }))
}

export function paceTotals(
  serviceYear: number,
  pace: PioneerPace,
  monthlyRate: number,
  concluded: boolean,
): PaceTotalPoint[] {
  const columns = paceColumns(serviceYear, pace)
  const lastDone = lastIndexWhere(columns, column => column.state !== 'future')
  const started = columns.findIndex(column => column.state !== 'off')
  let done = 0
  let goal = 0

  // Months he was not enrolled owe nothing; the months to come are planned, unless the stint has ended.
  const owes = (column: PaceColumn) =>
    column.state === 'reported' || column.state === 'missing' || (column.state === 'future' && !concluded)
  const projected = (index: number) =>
    concluded || lastDone < 0 || index < lastDone ? null : Math.round(done + pace.recentAvg * (index - lastDone))

  return columns.map((column, index) => {
    const past = index <= lastDone
    if (past) done += column.hours + column.credit
    const enrolled = started >= 0 && index >= started
    if (enrolled && owes(column)) goal += monthlyRate
    return {
      key: column.key,
      month: column.month,
      year: column.year,
      done: past ? done : null,
      goal: enrolled ? goal : null,
      projection: projected(index),
    }
  })
}
