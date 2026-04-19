import { z } from 'zod/v4'

export const createPublisherSchema = z.object({
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.enum(['male', 'female']),
  birthDate: z.string().optional().or(z.literal('')),
  baptismDate: z.string().optional().or(z.literal('')),
  isHelder: z.string().optional().transform(v => v === 'on'),
  isServant: z.string().optional().transform(v => v === 'on'),
  isAnointed: z.string().optional().transform(v => v === 'on'),
  group: z.coerce.number().optional(),
  type: z.string(),
})

export type CreatePublisherInput = z.infer<typeof createPublisherSchema>
