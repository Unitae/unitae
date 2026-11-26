// The months the activity export offers for the S-1. Pure and client-safe: the dialog lists them, the tests pin them.

/** A month as the activity page shows it; `month` is 0-indexed. */
export type ExportMonth = { month: number; year: number }

/** The month under way, in the reader's clock: the dialog only renders once opened, on the client. */
export function currentMonth(): ExportMonth {
  const now = new Date()
  return { month: now.getMonth(), year: now.getFullYear() }
}

/** The list with the chosen month in it, so the select never shows a value it does not offer. */
export function withMonth(months: ExportMonth[], chosen: ExportMonth): ExportMonth[] {
  const has = months.some(each => each.month === chosen.month && each.year === chosen.year)
  return has ? months : [chosen, ...months]
}

/**
 * The months the S-1 can be exported for: those of the service years with reports (September to August, `serviceYears`
 * newest first, as the year select gets them), newest first, never one after `now`. The current month alone when no year
 * has a report yet.
 */
export function exportMonths(serviceYears: number[], now: ExportMonth): ExportMonth[] {
  const nowIndex = now.year * 12 + now.month
  const months = serviceYears.flatMap(start =>
    Array.from({ length: 12 }, (_, offset) => {
      const index = start * 12 + 8 + (11 - offset)
      return { month: index % 12, year: Math.floor(index / 12) }
    }),
  )
  const past = months.filter(each => each.year * 12 + each.month <= nowIndex)
  return past.length > 0 ? past : [now]
}
