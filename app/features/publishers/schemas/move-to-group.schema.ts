import { z } from 'zod'

const QUERY_STRING = /^\?[^#]*$/

/** The publishers list's « Changer de groupe »: who, where to (`none` = out of every group), and the list to return to. */
export const moveToGroupSchema = z.object({
  memberId: z.array(z.coerce.number().int().positive()).min(1),
  groupId: z
    .string()
    .transform(value => (value === 'none' ? null : Number(value)))
    .pipe(z.number().int().positive().nullable()),
  // Only a query string: the action always returns to the publishers list itself.
  returnTo: z
    .string()
    .optional()
    .transform(value => (value != null && QUERY_STRING.test(value) ? value : '')),
})
