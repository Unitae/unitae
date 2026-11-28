import { z } from 'zod'

export const assignPartSchema = z.object({
  // The item's id (plan T12). `assignmentId` is the old row's, from a form the previous image rendered during the
  // rollout: the route translates it.
  itemId: z.string().optional(),
  assignmentId: z.string().optional(),
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
  // The room being assigned (parallel rooms); none, the part's only or main room, as a form of the previous image posts.
  roomId: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' ? Number(v) : null))
    .pipe(z.number().int().positive().nullable()),
  durationMin: z
    .string()
    .optional()
    .transform(v => (v == null || v === '' ? null : Number(v)))
    .pipe(z.number().int().min(0).nullable()),
})

export type AssignPartInput = z.infer<typeof assignPartSchema>
