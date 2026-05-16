import { getLocale } from '~/i18n/paraglide/runtime'

// Formats a `YYYY-MM` key into a short month name in the active locale.
// Centralises the chart formatting that was duplicated (in French) across
// MonthlyCoverageChart and AttributionsPerMonthChart.
export function formatMonthLabel(month: string): string {
  const [yearStr, monthStr] = month.split('-')
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 1)
  return new Intl.DateTimeFormat(getLocale(), { month: 'short' }).format(date)
}
