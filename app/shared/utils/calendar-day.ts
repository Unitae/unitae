import { combineLocalDateTime, formatDateForInput } from '~/shared/utils/event-time'

const LAST_MINUTE_MS = 59_999
const DAY_MS = 24 * 60 * 60 * 1000
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The calendar day an instant falls on in `timeZone`, as `YYYY-MM-DD`. */
export function dayOf(date: Date | string, timeZone: string): string {
  return formatDateForInput(date, timeZone)
}

/** The first instant of a day in `timeZone`. */
export function startOfDay(day: string, timeZone: string): Date {
  return combineLocalDateTime(day, '00:00', timeZone)
}

/** The very last instant of a day in `timeZone`: something that ends that day still covers all of it. */
export function endOfDay(day: string, timeZone: string): Date {
  return new Date(combineLocalDateTime(day, '23:59', timeZone).getTime() + LAST_MINUTE_MS)
}

/** Calendar arithmetic on `YYYY-MM-DD` days, free of any zone and of summer time. */
export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

/** How many days from one calendar day to another: 0 for the same day. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** The Monday of the week holding `day`. */
export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return addDays(day, weekday === 0 ? -6 : 1 - weekday)
}

/** A real calendar day written `YYYY-MM-DD`: « 2026-02-30 » is not one. */
export function isCalendarDay(value: string | null | undefined): value is string {
  if (value == null || !DAY.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
