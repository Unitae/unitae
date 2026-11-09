import { addDays, dayOf, mondayOf } from '~/shared/utils/calendar-day'

/** The Monday, as `YYYY-MM-DD`, of the week an instant falls in, in the congregation's zone. */
export function weekOf(date: Date | string, timeZone: string): string {
  return mondayOf(dayOf(date, timeZone))
}

interface Dated {
  startDate: Date | string
  endDate: Date | string
}

export interface AbsenceWeek<T> {
  /** The week's Monday, `YYYY-MM-DD`. */
  monday: string
  /** Who is away that week; `continued` when the absence began before it. */
  absences: { absence: T; continued: boolean }[]
}

/**
 * Every week of the period, Monday to Sunday in the congregation's zone, with the absences touching it: one lasting
 * three weeks shows in each. A week nobody is away comes back empty, so the page can say so.
 */
export function absenceWeeks<T extends Dated>(
  absences: T[],
  period: { from: string; to: string },
  timeZone: string,
): AbsenceWeek<T>[] {
  const weeks: AbsenceWeek<T>[] = []
  const last = mondayOf(period.to)
  for (let monday = mondayOf(period.from); monday <= last; monday = addDays(monday, 7)) {
    weeks.push({ monday, absences: [] })
  }
  for (const absence of absences) {
    const first = weekOf(absence.startDate, timeZone)
    const end = weekOf(absence.endDate, timeZone)
    for (const week of weeks) {
      if (week.monday >= first && week.monday <= end) week.absences.push({ absence, continued: week.monday > first })
    }
  }
  return weeks
}

/** The assignments falling in the week that starts on `monday`. */
export function conflictsInWeek<T extends { eventDate: Date | string }>(
  conflicts: T[],
  monday: string,
  timeZone: string,
): T[] {
  return conflicts.filter(conflict => weekOf(conflict.eventDate, timeZone) === monday)
}

const MARKS = /\p{M}/gu

/** Folds case and accents, so « elodie » finds « Élodie ». */
function fold(text: string): string {
  return text.normalize('NFD').replace(MARKS, '').toLowerCase()
}

/** Whether a name holds what was typed; an empty search matches everyone. */
export function matchesName(name: string, query: string): boolean {
  const wanted = fold(query.trim())
  return wanted === '' || fold(name).includes(wanted)
}
