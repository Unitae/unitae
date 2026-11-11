export const AUDIT_PERIODS = ['7d', '30d', '3m', '12m', 'all', 'custom'] as const
export type AuditPeriod = (typeof AUDIT_PERIODS)[number]

const DEFAULT_PERIOD: AuditPeriod = '30d'
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A real day written yyyy-mm-dd, or nothing. */
function validDay(value: string | null | undefined): string | undefined {
  if (!value || !DAY.test(value)) return undefined
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined
}

function shiftDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** The same day `months` earlier, kept inside a shorter month (31 May → 28 February). */
function monthsBefore(day: string, months: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const first = new Date(Date.UTC(year, month - 1 - months, 1))
  const lastOfMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(date, lastOfMonth))
  return first.toISOString().slice(0, 10)
}

/**
 * The days the audit log shows, from what the address asks: the last 7 or 30 days, 3 or 12 months (today included,
 * `today` being the congregation's), everything, or chosen dates. Nothing chosen, or a period it does not know, is the
 * last 30 days; chosen dates come back in order, and one that is not a day is left out.
 */
export function auditPeriod(
  asked: { period?: string | null; from?: string | null; to?: string | null },
  today: string,
): { period: AuditPeriod; from: string | undefined; to: string | undefined } {
  const period = AUDIT_PERIODS.find(each => each === asked.period) ?? DEFAULT_PERIOD
  switch (period) {
    case '7d':
      return { period, from: shiftDays(today, -6), to: undefined }
    case '30d':
      return { period, from: shiftDays(today, -29), to: undefined }
    case '3m':
      return { period, from: shiftDays(monthsBefore(today, 3), 1), to: undefined }
    case '12m':
      return { period, from: shiftDays(monthsBefore(today, 12), 1), to: undefined }
    case 'all':
      return { period, from: undefined, to: undefined }
    case 'custom': {
      const from = validDay(asked.from)
      const to = validDay(asked.to)
      if (from && to && from > to) return { period, from: to, to: from }
      return { period, from, to }
    }
  }
}
