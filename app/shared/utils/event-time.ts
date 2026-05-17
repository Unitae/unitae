const OFFSET_REGEX = /GMT(?<offset>[+-]\d{2}:\d{2})?/

function formatOffset(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
    year: 'numeric',
  })
  const parts = formatter.formatToParts(date)
  const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  const match = offsetPart.match(OFFSET_REGEX)
  return match?.groups?.offset ?? '+00:00'
}

export function combineLocalDateTime(dateStr: string, timeStr: string, timezone: string): Date {
  const utcGuess = new Date(`${dateStr}T${timeStr}:00Z`)
  const offset = formatOffset(utcGuess, timezone)
  const candidate = new Date(`${dateStr}T${timeStr}:00${offset}`)
  const refinedOffset = formatOffset(candidate, timezone)
  if (refinedOffset === offset) return candidate
  return new Date(`${dateStr}T${timeStr}:00${refinedOffset}`)
}

export function setHoursInTimezone(date: Date, hour: number, minute: number, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find(p => p.type === 'year')?.value ?? '1970'
  const month = parts.find(p => p.type === 'month')?.value ?? '01'
  const day = parts.find(p => p.type === 'day')?.value ?? '01'
  const dateStr = `${year}-${month}-${day}`
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return combineLocalDateTime(dateStr, timeStr, timezone)
}

export function formatEventTime(date: Date | string, timezone: string, locale = 'fr-FR'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString(locale, { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
}

export function formatEventDate(
  date: Date | string,
  timezone: string,
  locale = 'fr-FR',
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(locale, { timeZone: timezone, ...options })
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function parseTimeString(timeStr: string): { hour: number; minute: number } {
  const [hour, minute] = timeStr.split(':').map(Number)
  return { hour: hour ?? 0, minute: minute ?? 0 }
}

export function formatDateForInput(date: Date | string, timezone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(d)
  const year = parts.find(p => p.type === 'year')?.value ?? '1970'
  const month = parts.find(p => p.type === 'month')?.value ?? '01'
  const day = parts.find(p => p.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

export function formatTimeForInput(date: Date | string, timezone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return formatter.format(d)
}
