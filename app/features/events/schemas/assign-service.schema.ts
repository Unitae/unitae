import { z } from 'zod'

export const assignServiceSchema = z.object({
  // The item's id (plan T12). `assignmentId` is the old row's, from a form the previous image rendered during the
  // rollout: the route translates it.
  itemId: z.string().optional(),
  assignmentId: z.string().optional(),
  assigneeId: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
})

export type AssignServiceInput = z.infer<typeof assignServiceSchema>
