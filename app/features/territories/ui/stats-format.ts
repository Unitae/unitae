import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'

// Locale-aware figures for the stats page (« 87,4 % » in French), replacing raw toFixed().
export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits }).format(value)
}

// A narrow no-break space keeps « 87,4 % » on one line, as French typography wants.
export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return `${formatNumber(value, maximumFractionDigits)}\u202f%`
}

// Signed difference for comparisons: « +6,2 », « −5 ».
export function formatDelta(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits, signDisplay: 'exceptZero' }).format(value)
}

// Labels for the Chart / Table switch every stats chart carries.
export function statsViewLabels() {
  return { chart: m.stats_view_chart(), table: m.stats_view_table(), group: m.stats_view_group() }
}

// `YYYY-MM` key of the current month, to emphasise it in monthly charts.
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** What a figure shows when there is nothing to measure (no attribution returned yet): never a 0 that reads as a result. */
export const NO_FIGURE = '–'

/** A figure, or « – » when there is nothing to measure. */
export function formatFigure(value: number | null, format: (value: number) => string = formatNumber): string {
  return value == null ? NO_FIGURE : format(value)
}

/**
 * Attributions per territory, from the server's overlap figure (attributions that touched the period over the number
 * of territories, as a percentage): « 1,9 », never a coverage above 100 %.
 */
export function formatPerTerritory(overlapPercent: number): string {
  return formatNumber(overlapPercent / 100, 1)
}
