import { DateChip as Chip } from '@unitae/ui'
import { getLocale } from '~/i18n/paraglide/runtime'
import { formatEventDate } from '~/shared/utils/event-time'

/** A day as a small tile, « NOV. » over « 10 », read in the congregation's zone. */
export function DateChip({ date, timeZone }: { date: Date | string; timeZone: string }) {
  const locale = getLocale()
  return (
    <Chip
      month={formatEventDate(date, timeZone, locale, { month: 'short' })}
      day={formatEventDate(date, timeZone, locale, { day: 'numeric' })}
    />
  )
}
