import { z } from 'zod'
import { PublisherType } from '~/shared/types/publisher-type'
import { phoneSchema } from '~/shared/utils/phone'

export const createPublisherSchema = z.object({
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.enum(['male', 'female']),
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
  group: z.preprocess(v => (v === '' || v === undefined ? undefined : v), z.coerce.number().optional()),
  type: z.nativeEnum(PublisherType),
  phone: phoneSchema,
  address: z.string().optional().default(''),
})

export type CreatePublisherInput = z.infer<typeof createPublisherSchema>
