// Returns a Date whose *local* fields (getFullYear/getMonth/getDate/getHours/getMinutes)
// read as the wall clock in `timezone`. This is NOT the same instant as `base` — only the
// local getters are valid; do not serialize it or call .getTime()/.toISOString()/UTC
// methods. Used so service-year and "current month" calculations follow the congregation's
// timezone, not the server's.
export function zonedNow(timezone: string, base: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(base)

  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value)
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
}
