import { z } from 'zod'

/** Posted for « Aucun : ceux qui gèrent les programmes ». A role left out of the post is left as it is. */
export const NO_RESPONSIBLE = 'none'

/**
 * What Réglages › « Modèles de planning » posts for one template: its id, its name and its responsible role. Conform
 * reads a blank field as a missing one, so a blank or missing name is no name (a keyed template then reads as its
 * kind's label; the form always posts it), while the role tells « none » from a field left out.
 */
export const scheduleTemplateSchema = z.object({
  scheduleTemplateId: z.coerce.number().int().positive(),
  name: z
    .string()
    .max(80)
    .optional()
    .transform(value => value?.trim() || null),
  responsibleRoleId: z
    .union([z.literal(NO_RESPONSIBLE), z.coerce.number().int().positive()])
    .optional()
    .transform(value => (value === NO_RESPONSIBLE ? null : value)),
})

export type ScheduleTemplateInput = z.infer<typeof scheduleTemplateSchema>
