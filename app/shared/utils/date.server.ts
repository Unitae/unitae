// Parses `YYYY-MM-DD` as local midnight. `new Date(s)` would treat it as
// UTC midnight, which silently shifts SQL bounds in non-UTC zones.
export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * The day an instant falls on in the server's zone, as `YYYY-MM-DD`: the inverse of parseLocalDate, so a day saved
 * with it reads back as the same day, whoever looks at it and from wherever.
 */
export function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Returns local midnight of the day AFTER `date`. Use as the exclusive
// upper bound of a date range, paired with Prisma `lt`.
export function startOfNextDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
}
