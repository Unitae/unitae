import { z } from 'zod'
import * as m from '~/i18n/paraglide/messages'

const roleIdsField = z.preprocess(
  v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(z.coerce.number().int().positive()),
)

/**
 * A section, new or edited. « Tout le monde » or « Certains rôles » is chosen out loud: an empty list of
 * roles no longer means everyone by accident. Restricted, it needs at least one role.
 */
export const sectionSchema = z
  .object({
    name: z
      .string({ error: () => m.board_section_form_name_required() })
      .trim()
      .min(1, { error: () => m.board_section_form_name_required() }),
    visibility: z.enum(['everyone', 'roles']).default('everyone'),
    visibilityRoleIds: roleIdsField.default([]),
  })
  .refine(value => value.visibility === 'everyone' || value.visibilityRoleIds.length > 0, {
    path: ['visibilityRoleIds'],
    error: () => m.board_section_form_roles_required(),
  })
  .transform(value => ({
    name: value.name,
    visibilityRoleIds: value.visibility === 'everyone' ? [] : value.visibilityRoleIds,
  }))

export type SectionInput = z.infer<typeof sectionSchema>
