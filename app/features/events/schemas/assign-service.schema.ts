import { z } from 'zod'

export const assignServiceSchema = z.object({
  assignmentId: z.coerce.number(),
  assigneeId: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
})

export type AssignServiceInput = z.infer<typeof assignServiceSchema>
