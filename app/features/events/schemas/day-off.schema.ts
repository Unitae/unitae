import { z } from 'zod'
import * as m from '~/i18n/paraglide/messages'

const DAY = /^\d{4}-\d{2}-\d{2}$/

const day = (required: () => string) =>
  z.string({ error: required }).regex(DAY, { error: () => m.days_off_form_day_invalid() })

/** An absence as the form posts it: its first and last days, both included, in the congregation's zone. */
export const dayOffSchema = z
  .object({
    first: day(() => m.days_off_form_first_required()),
    last: day(() => m.days_off_form_last_required()),
  })
  // `YYYY-MM-DD` sorts as the calendar does; the same day twice is a one-day absence.
  .refine(value => value.last >= value.first, { path: ['last'], error: () => m.days_off_form_last_before_first() })
