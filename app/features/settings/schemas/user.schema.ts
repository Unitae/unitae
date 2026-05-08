import { z } from 'zod'

export const createUserSchema = z.object({
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  email: z.string().email(),
})

export const editUserSchema = z.object({
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  email: z.string().email(),
  active: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  permissions: z
    .array(z.string())
    .or(z.string().transform(v => [v]))
    .optional()
    .default([]),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type EditUserInput = z.infer<typeof editUserSchema>
