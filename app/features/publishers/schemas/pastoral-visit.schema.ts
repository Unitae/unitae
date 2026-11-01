import { z } from 'zod'
import * as m from '~/i18n/paraglide/messages'

// Two buttons on one form: save the date given, or clear the recorded one.
export const pastoralVisitSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('save'),
    // A date input's value, YYYY-MM-DD, of a day that exists.
    visitedOn: z.iso.date({ error: () => m.publishers_visit_error_date() }),
  }),
  z.object({ intent: z.literal('clear') }),
])
