import { z } from 'zod'

export const updatePublisherSchema = z.object({
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.string(),
  birthDate: z.string().optional().or(z.literal('')),
  baptismDate: z.string().optional().or(z.literal('')),
  isHelder: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  isServant: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  isAnointed: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  group: z.coerce.number().optional(),
  type: z.string(),
  phone: z.string().optional().default(''),
  address: z.string().optional().default(''),
})

export type UpdatePublisherInput = z.infer<typeof updatePublisherSchema>
