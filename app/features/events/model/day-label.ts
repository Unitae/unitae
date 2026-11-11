import { getLocale } from '~/i18n/paraglide/runtime'

// 7 January 2024 was a Sunday: weekday n is n days later. Noon UTC keeps it on that day in every time zone.
const SUNDAY = Date.UTC(2024, 0, 7, 12)

function weekdayName(weekDay: number, width: 'long' | 'short'): string {
  if (!Number.isInteger(weekDay) || weekDay < 0 || weekDay > 6) return ''
  const locale = getLocale()
  const name = new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(
    SUNDAY + weekDay * 86_400_000,
  )
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
}

/** A weekday (0 is Sunday) in the reader's language, capitalised as a label: « Mardi ». */
export function dayLabel(weekDay: number): string {
  return weekdayName(weekDay, 'long')
}

/** The same, shortened: « Mar. ». */
export function dayLabelShort(weekDay: number): string {
  return weekdayName(weekDay, 'short')
}
