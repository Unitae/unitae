import { z } from 'zod'
import * as m from '~/i18n/paraglide/messages'
import { daysBetween, isCalendarDay } from '~/shared/utils/calendar-day'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
/** A series reaches a year at most: the page lists every week of it. */
const LONGEST_SERIES_DAYS = 365

/** One form value or several, as a list: a lone ticked box arrives as a string. */
const list = (value: unknown) => (value == null ? [] : Array.isArray(value) ? value : [value])

/**
 * The creation form, in its three modes. `today` is the congregation's calendar day: nothing is created before it.
 */
export function programmeCreationSchema(today: string) {
  const day = z
    .string({ error: () => m.programs_new_error_day() })
    .refine(value => isCalendarDay(value), { error: () => m.programs_new_error_day(), abort: true })
    .refine(value => value >= today, { error: () => m.programs_new_error_past() })

  const series = z
    .object({
      mode: z.literal('series'),
      templateIds: z.preprocess(
        list,
        z.array(z.coerce.number().int().positive()).min(1, { error: () => m.programs_new_error_no_meeting() }),
      ),
      from: day,
      to: day,
      skip: z.preprocess(list, z.array(z.string())),
    })
    .refine(value => value.to >= value.from, { path: ['to'], error: () => m.programs_new_error_to_before_from() })
    .refine(value => daysBetween(value.from, value.to) < LONGEST_SERIES_DAYS, {
      path: ['to'],
      error: () => m.programs_new_error_too_long(),
    })

  const single = z.object({
    mode: z.literal('single'),
    templateId: z.coerce
      .number({ error: () => m.programs_new_error_template() })
      .int()
      .positive(),
    day,
  })

  const time = z
    .string({ error: () => m.programs_new_error_time() })
    .regex(TIME, { error: () => m.programs_new_error_time() })
  const freeform = z
    .object({
      mode: z.literal('freeform'),
      name: z
        .string({ error: () => m.programs_new_error_name() })
        .trim()
        .min(1, { error: () => m.programs_new_error_name() })
        .max(120),
      day,
      startTime: time,
      endTime: time,
    })
    .refine(value => value.endTime > value.startTime, {
      path: ['endTime'],
      error: () => m.programs_new_error_end_before_start(),
    })

  return z.discriminatedUnion('mode', [series, single, freeform])
}

export type ProgrammeCreationInput = z.infer<ReturnType<typeof programmeCreationSchema>>
