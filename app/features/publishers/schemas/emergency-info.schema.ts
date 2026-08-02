import { z } from 'zod'
import { nameSchema } from '~/shared/utils/name'
import { phoneSchema } from '~/shared/utils/phone'

export const emergencyContactSchema = z.object({
  name: nameSchema,
  relationship: z.string().trim().max(100).optional().default(''),
  phone: phoneSchema,
})

export const updateEmergencyInfoSchema = z.object({
  dpaCardUpToDate: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  survivalBackpackReady: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  contacts: z.array(emergencyContactSchema).optional().default([]),
})

export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>
export type UpdateEmergencyInfoInput = z.infer<typeof updateEmergencyInfoSchema>
