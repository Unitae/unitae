import { getLocale } from '~/i18n/paraglide/runtime'

/** « octobre 2026 », in the reader's language. */
export function formatMonthYear(month: number, year: number): string {
  return new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
}

/** « octobre », in the reader's language. */
export function formatMonth(month: number, year: number): string {
  return new Intl.DateTimeFormat(getLocale(), { month: 'long' }).format(new Date(year, month, 1))
}
