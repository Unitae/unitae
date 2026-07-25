import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const resetPasswordSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    passwordConfirm: z.string().min(8),
  })
  .refine(data => data.password === data.passwordConfirm, {
    path: ['passwordConfirm'],
  })

export const registerSchema = z
  .object({
    'congregation-name': z.string().min(2),
    locale: z.string().default('fr'),
    email: z.string().email().min(5),
    password: z.string().min(8),
    'repeat-password': z.string().min(8),
  })
  .refine(data => data.password === data['repeat-password'], {
    path: ['repeat-password'],
  })

export const setupSchema = z
  .object({
    email: z.string().email().min(5),
    locale: z.string().default('fr'),
    password: z.string().min(8),
    'repeat-password': z.string().min(8),
  })
  .refine(data => data.password === data['repeat-password'], {
    path: ['repeat-password'],
  })

export const changePasswordSchema = z.object({
  // Current password: verified by compare() against the stored hash, so length
  // is not enforced here — an already-stored legacy short password must pass.
  password: z.string().min(1),
  new_password: z.string().min(8),
})

export const consentSchema = z.object({
  purpose: z.string().min(1),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type SetupInput = z.infer<typeof setupSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ConsentInput = z.infer<typeof consentSchema>
