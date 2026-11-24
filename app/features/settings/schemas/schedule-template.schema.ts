import { z } from 'zod'

/**
 * What Réglages › « Modèles de planning » posts for one template: its id, its name (blank keeps a keyed template
 * unnamed, read as its kind's label) and its responsible role (blank: those who manage the programmes).
 */
export const scheduleTemplateSchema = z.object({
  scheduleTemplateId: z.coerce.number().int().positive(),
  name: z
    .string()
    .max(80)
    .optional()
    .transform(value => value?.trim() || null),
  responsibleRoleId: z
    .union([z.literal(''), z.coerce.number().int().positive()])
    .optional()
    .transform(value => (value === '' || value == null ? null : value)),
})

export type ScheduleTemplateInput = z.infer<typeof scheduleTemplateSchema>
