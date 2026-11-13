import { dayOf, mondayOf } from '~/shared/utils/calendar-day'

// The board's programme on screen reads week by week, opening on the week under way: the weeks
// already over fold away above it. Weeks run Monday to Sunday in the congregation's time zone.

export interface ProgrammeWeek<U> {
  /** The week's Monday, `YYYY-MM-DD`. */
  monday: string
  /** The week that holds today. */
  current: boolean
  /** A week entirely before today's. */
  past: boolean
  units: U[]
}

/** The meetings grouped by week, in the order they came, each week placed against today. */
export function programmeWeeks<U extends { event: { startDate: Date | string } }>(
  units: U[],
  now: Date,
  timeZone: string,
): ProgrammeWeek<U>[] {
  const thisWeek = mondayOf(dayOf(now, timeZone))
  const weeks = new Map<string, ProgrammeWeek<U>>()
  for (const unit of units) {
    const monday = mondayOf(dayOf(unit.event.startDate, timeZone))
    const week = weeks.get(monday)
    if (week) week.units.push(unit)
    else weeks.set(monday, { monday, current: monday === thisWeek, past: monday < thisWeek, units: [unit] })
  }
  return [...weeks.values()]
}
