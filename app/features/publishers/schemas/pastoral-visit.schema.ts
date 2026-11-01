import { z } from 'zod'
import * as m from '~/i18n/paraglide/messages'

// A date input's value: YYYY-MM-DD.
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/

// Two buttons on one form: save the date given, or clear the recorded one.
export const pastoralVisitSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('save'),
    visitedOn: z
      .string({ error: () => m.publishers_visit_error_date() })
      .regex(DATE_INPUT, { error: () => m.publishers_visit_error_date() }),
  }),
  z.object({ intent: z.literal('clear') }),
])
