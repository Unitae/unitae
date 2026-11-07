import { getLocale } from '~/i18n/paraglide/runtime'

// Formats a `YYYY-MM` key into a short month name in the active locale.
// Centralises month formatting for the territory stats charts.
export function formatMonthLabel(month: string): string {
  return new Intl.DateTimeFormat(getLocale(), { month: 'short' }).format(monthKeyToDate(month))
}

// Full month and year (« septembre 2025 ») for chart tooltips and table views, where the axis
// keeps the short form.
export function formatMonthLong(month: string): string {
  return new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric' }).format(monthKeyToDate(month))
}

function monthKeyToDate(month: string): Date {
  const [yearStr, monthStr] = month.split('-')
  return new Date(Number(yearStr), Number(monthStr) - 1, 1)
}
