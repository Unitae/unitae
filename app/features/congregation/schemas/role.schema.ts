import { z } from 'zod'

/** A tick in Équipes: a person put in a team, or taken out. The role goes to the person's record, login or not. */
export const toggleSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  roleId: z.coerce.number().int().positive(),
  intent: z.enum(['add', 'remove']),
})

/** Who Équipes shows: everyone, or the brothers, the sisters, the elders… */
export type BuiltInFilterKey =
  | 'all'
  | 'male'
  | 'female'
  | 'publisher'
  | 'baptized'
  | 'anointed'
  | 'elder'
  | 'assistant-servant'
