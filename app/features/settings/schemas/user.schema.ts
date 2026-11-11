import { z } from 'zod'
import * as m from '~/i18n/paraglide/messages'

const required = (message: () => string) => z.string({ error: message }).trim().min(1, { error: message })
const emailField = z.email({ error: () => m.settings_account_email_invalid() })

export const createUserSchema = z.object({
  firstname: required(() => m.settings_account_firstname_required()),
  lastname: required(() => m.settings_account_lastname_required()),
  email: emailField,
})

export const editUserSchema = z.object({
  /** Absent for an account linked to a record: its name is the record's, corrected from there. */
  firstname: required(() => m.settings_account_firstname_required()).optional(),
  lastname: required(() => m.settings_account_lastname_required()).optional(),
  email: emailField,
  active: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  customRoleIds: z
    .array(z.coerce.number().int().positive())
    .or(
      z.coerce
        .number()
        .int()
        .positive()
        .transform(v => [v]),
    )
    .optional()
    .default([]),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type EditUserInput = z.infer<typeof editUserSchema>
