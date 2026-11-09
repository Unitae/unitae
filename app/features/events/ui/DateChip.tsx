import { getLocale } from '~/i18n/paraglide/runtime'
import { formatEventDate } from '~/shared/utils/event-time'

/** A day as a small tile, « NOV. » over « 10 », read in the congregation's zone. */
export function DateChip({ date, timeZone }: { date: Date | string; timeZone: string }) {
  const locale = getLocale()
  return (
    <span
      aria-hidden="true"
      className="flex size-11 shrink-0 flex-col items-center justify-center rounded-md border border-border leading-none"
    >
      <span className="font-semibold text-[10px] text-brand-text uppercase tracking-wide">
        {formatEventDate(date, timeZone, locale, { month: 'short' })}
      </span>
      <span className="mt-1 font-semibold text-base tabular-nums">
        {formatEventDate(date, timeZone, locale, { day: 'numeric' })}
      </span>
    </span>
  )
}
