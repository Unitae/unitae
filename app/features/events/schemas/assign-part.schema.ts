import { z } from 'zod'

export const assignPartSchema = z.object({
  assignmentId: z.coerce.number(),
  speakerType: z.enum(['internal', 'external']).default('internal'),
  assigneeId: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
  assistantId: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
  externalSpeakerId: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
  topic: z.string().optional().default(''),
})

export type AssignPartInput = z.infer<typeof assignPartSchema>
