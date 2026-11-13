import { DateField, type DateFieldProps } from '@unitae/ui'

import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'

/**
 * The app's date field: the day written out with its weekday (« mar. 10 novembre 2026 »), typed in the reader's
 * order or picked in a calendar, the phone's own picker on a touch screen. Posts `YYYY-MM-DD` under `name`.
 */
export function DateInput(props: Omit<DateFieldProps, 'locale' | 'labels'>) {
  return (
    <DateField
      locale={getLocale()}
      labels={{
        openCalendar: m.date_field_open_calendar(),
        previousMonth: m.date_field_previous_month(),
        nextMonth: m.date_field_next_month(),
      }}
      {...props}
    />
  )
}
