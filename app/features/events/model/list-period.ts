import { addDays, daysBetween } from '~/shared/utils/calendar-day'

/** The periods offered in one click, each starting today. */
export const PERIOD_PRESETS = ['4-weeks', 'next-month', '3-months'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

/** A period of whole days in the congregation's zone, as `YYYY-MM-DD`, both ends included. */
export interface ListPeriod {
  from: string
  to: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar day written `YYYY-MM-DD`: « 2026-02-30 » is not one. */
function isDay(value: string | null): value is string {
  if (value == null || !DAY.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** The same date `count` months later, held to the month's last day (31 January + 1 month = 28 February). */
function addMonths(day: string, count: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const lastOfTarget = new Date(Date.UTC(year, month - 1 + count + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month - 1 + count, Math.min(date, lastOfTarget))).toISOString().slice(0, 10)
}

/** Where a preset starting `today` ends. */
export function presetEnd(preset: PeriodPreset, today: string): string {
  if (preset === '4-weeks') return addDays(today, 27)
  if (preset === '3-months') return addDays(addMonths(today, 3), -1)
  const [year, month] = today.split('-').map(Number)
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
}

function isPreset(value: string | null): value is PeriodPreset {
  return PERIOD_PRESETS.some(preset => preset === value)
}

/**
 * The period the address asks for: a preset (`?period=4-weeks`), which starts today whenever the link is opened, or
 * days picked by hand (`?from=&to=`); from today to the end of next month by default. It never ends before it starts,
 * and stops a year after it starts: the page lists every week of it.
 */
export function listPeriod(params: URLSearchParams, today: string): ListPeriod {
  const preset = params.get('period')
  if (isPreset(preset)) return { from: today, to: presetEnd(preset, today) }
  const fromParam = params.get('from')
  const toParam = params.get('to')
  const from = isDay(fromParam) ? fromParam : today
  const asked = isDay(toParam) ? toParam : presetEnd('next-month', today)
  const latest = addDays(addMonths(from, 12), -1)
  const to = daysBetween(from, asked) < 0 ? from : daysBetween(asked, latest) < 0 ? latest : asked
  return { from, to }
}

/** The preset a period matches, or null for days picked by hand. */
export function selectedPreset(period: ListPeriod, today: string): PeriodPreset | null {
  if (period.from !== today) return null
  return PERIOD_PRESETS.find(preset => presetEnd(preset, today) === period.to) ?? null
}
