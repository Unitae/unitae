import { z } from 'zod'

export const externalSpeakerSchema = z
  .object({
    name: z.string().trim().min(1),
    congregationName: z.string().trim().min(1),
    phone: z.string().trim().optional().default(''),
    email: z
      .string()
      .trim()
      .optional()
      .default('')
      .refine(v => v === '' || z.string().email().safeParse(v).success, {
        message: 'Adresse e-mail invalide.',
      }),
    notes: z.string().trim().optional().default(''),
  })
  .refine(v => v.phone !== '' || v.email !== '', {
    message: 'Au moins un téléphone ou un e-mail est requis.',
    path: ['phone'],
  })

export type ExternalSpeakerFormInput = z.infer<typeof externalSpeakerSchema>
