import { z } from 'zod'
import * as m from '~/i18n/paraglide/messages'

// Messages are functions so each error is written in the locale of the request that raised it.
function required(message: () => string) {
  const error = () => message()
  return z.string({ error }).trim().min(1, { error })
}

export const createGroupSchema = z
  .object({
    name: required(m.groups_form_error_name_required),
    address: required(m.groups_form_error_address_required),
    responsible: z.coerce
      .number({ error: () => m.groups_form_error_responsible_required() })
      .int()
      .positive({ error: () => m.groups_form_error_responsible_required() }),
    deputy: z
      .string()
      .optional()
      .transform(v => (v != null && v !== '' ? Number(v) : undefined))
      .pipe(z.number().optional()),
  })
  .refine(group => group.deputy == null || group.deputy !== group.responsible, {
    error: () => m.groups_form_error_same_person(),
    path: ['deputy'],
  })

export const updateGroupSchema = createGroupSchema

export type CreateGroupInput = z.infer<typeof createGroupSchema>

// The publisher picked on the edit page's membership card.
export const groupMemberSchema = z.object({
  memberId: z.coerce.number().int().positive(),
})
