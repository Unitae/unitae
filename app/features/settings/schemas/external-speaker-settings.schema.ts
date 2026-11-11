import { z } from 'zod'

/** A select cannot carry an empty value: « Aucun » is this one. */
export const NO_ROLE = 'none'

const roleKey = z
  .string()
  .default(NO_ROLE)
  .transform(value => (value === NO_ROLE || value === '' ? null : value))

export const externalSpeakerSettingsSchema = z.object({
  candidatesRoleKey: roleKey,
  responsibleRoleKey: roleKey,
})
