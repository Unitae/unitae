const MINUTE = 60
const HOUR = 3600
const DAY = 86400
const WEEK = 604800
const MONTH = 2592000 // 30 days
const YEAR = 31536000 // 365 days

export function formatRelativeTime(date: Date | string, locale = 'fr'): string {
  const target = date instanceof Date ? date : new Date(date)
  const now = new Date()
  const diffSeconds = Math.round((target.getTime() - now.getTime()) / 1000)
  const absDiff = Math.abs(diffSeconds)

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (absDiff < MINUTE) return rtf.format(0, 'second')
  if (absDiff < HOUR) return rtf.format(Math.round(diffSeconds / MINUTE), 'minute')
  if (absDiff < DAY) return rtf.format(Math.round(diffSeconds / HOUR), 'hour')
  if (absDiff < WEEK) return rtf.format(Math.round(diffSeconds / DAY), 'day')
  if (absDiff < MONTH) return rtf.format(Math.round(diffSeconds / WEEK), 'week')
  if (absDiff < YEAR) return rtf.format(Math.round(diffSeconds / MONTH), 'month')

  // For dates over a year, fall back to absolute format
  return target.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatAbsoluteDate(date: Date | string, locale = 'fr'): string {
  const target = date instanceof Date ? date : new Date(date)
  return target.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}
