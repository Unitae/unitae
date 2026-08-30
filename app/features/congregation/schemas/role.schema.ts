import { z } from 'zod'
import { checkbox } from '~/features/congregation/schemas/organigram.schema'

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().default(''),
  // A personal role: one titulaire with a handover, adjoints allowed, no plain members.
  singlePerson: checkbox,
})

export const editRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().default(''),
  singlePerson: checkbox,
})

export const toggleSchema = z.object({
  // A Member id. Assignments are account-bound, so the action resolves the member's account —
  // calling this `userId` is what let a Member id reach `userRoleAssignment.create` unnoticed.
  memberId: z.coerce.number().int().positive(),
  roleId: z.coerce.number().int().positive(),
  intent: z.enum(['add', 'remove']),
})

export type CreateRoleInput = z.infer<typeof createRoleSchema>
export type EditRoleInput = z.infer<typeof editRoleSchema>
export type ToggleInput = z.infer<typeof toggleSchema>

const BUILT_IN_FILTER_KEYS = [
  'all',
  'male',
  'female',
  'publisher',
  'baptized',
  'anointed',
  'elder',
  'assistant-servant',
] as const

export type BuiltInFilterKey = (typeof BUILT_IN_FILTER_KEYS)[number]
