import { addDays, mondayOf } from '~/shared/utils/calendar-day'
import { daysOnWeekday, programmeKey } from './programme-dates'

/** A template programmes can be created from, as the creation page shows it. */
export interface CreationTemplate {
  id: number
  name: string
  color: string
  /** 0 = Sunday; null for a template without a day of its own, such as the Memorial. */
  weekDay: number | null
  startTime: string
  endTime: string
  parts: number
  services: number
  /** The day of its latest programme, in the congregation's zone. */
  lastDay: string | null
}

/** A programme a template already has on a day to come. */
export interface ExistingProgramme {
  templateId: number
  day: string
  eventId: number
}

/** One programme a series would hold. */
export interface PlannedProgramme {
  key: string
  template: CreationTemplate
  day: string
  /** The programme the template already has that day, left as it is. */
  existingId: number | null
}

export interface SeriesCount {
  create: number
  existing: number
  skipped: number
}

/** How far a series can reach in one click: the end of the 1st, 2nd, 3rd and 6th month after its start's. */
const SERIES_END_MONTHS = [1, 2, 3, 6] as const

export function isRecurring(template: CreationTemplate): template is CreationTemplate & { weekDay: number } {
  return template.weekDay != null
}

/**
 * Where a series starts unless told otherwise: the day after the earliest last programme of the templates, so that
 * nothing is doubled and no week is forgotten between two. Never before today; today for a template with nothing to
 * come.
 */
export function seriesStart(templates: CreationTemplate[], today: string): string {
  const starts = templates.map(template =>
    template.lastDay != null && template.lastDay >= today ? addDays(template.lastDay, 1) : today,
  )
  // `YYYY-MM-DD` days sort as text: the first is the earliest.
  return starts.sort()[0] ?? today
}

/** The last day of the month `count` months after the one holding `day`. */
export function monthEnd(day: string, count: number): string {
  const [year, month] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + count + 1, 0)).toISOString().slice(0, 10)
}

/** The ends offered for a series starting on `from`. */
export function seriesEnds(from: string): string[] {
  return SERIES_END_MONTHS.map(count => monthEnd(from, count))
}

/**
 * The programmes a series would hold: each regular template on its weekday from `from` to `to`, by day then by hour,
 * with the ones the template already has. The same days the server creates (`daysOnWeekday` on both sides).
 */
export function plannedSeries(
  templates: CreationTemplate[],
  from: string,
  to: string,
  existing: ExistingProgramme[],
): PlannedProgramme[] {
  const known = new Map(
    existing.map(programme => [programmeKey(programme.templateId, programme.day), programme.eventId]),
  )
  return templates
    .filter(isRecurring)
    .flatMap(template =>
      daysOnWeekday(template.weekDay, from, to).map(day => {
        const key = programmeKey(template.id, day)
        return { key, template, day, existingId: known.get(key) ?? null }
      }),
    )
    .sort((a, b) => compare(a.day, b.day) || compare(a.template.startTime, b.template.startTime))
}

/** What a series will create once the passed days are left out. */
export function countSeries(planned: PlannedProgramme[], skipped: ReadonlySet<string>): SeriesCount {
  const count: SeriesCount = { create: 0, existing: 0, skipped: 0 }
  for (const row of planned) {
    if (row.existingId != null) count.existing++
    else if (skipped.has(row.key)) count.skipped++
    else count.create++
  }
  return count
}

/** Rows grouped under the Monday of their week, Monday to Sunday like the programmes list. */
export function byWeek<T extends { day: string }>(rows: T[]): { monday: string; rows: T[] }[] {
  const weeks: { monday: string; rows: T[] }[] = []
  for (const row of rows) {
    const monday = mondayOf(row.day)
    const week = weeks.at(-1)
    if (week?.monday === monday) week.rows.push(row)
    else weeks.push({ monday, rows: [row] })
  }
  return weeks
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
