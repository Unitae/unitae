import { z } from 'zod'
import { PublisherType } from '~/shared/types/publisher-type'
import { nameSchema } from '~/shared/utils/name'
import { phoneSchema } from '~/shared/utils/phone'

export const updatePublisherSchema = z.object({
  firstname: nameSchema,
  lastname: nameSchema,
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
  type: z.nativeEnum(PublisherType),
  phone: phoneSchema,
  address: z.string().optional().default(''),
})

export type UpdatePublisherInput = z.infer<typeof updatePublisherSchema>
