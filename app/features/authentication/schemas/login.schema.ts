import { z } from 'zod'

// Password length policy, shared across every set-password flow. The lower bound
// is the unified minimum. The upper bound caps input before it reaches the
// CPU-bound zxcvbn estimator (see password-strength.server) so a multi-KB
// password on the public register/setup/reset endpoints cannot stall the event
// loop. login stays uncapped on purpose — it only feeds a fixed-cost hash
// compare, and a max there could lock out an already-stored long password.
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128

const newPassword = () => z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH)

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
    password: newPassword(),
    passwordConfirm: newPassword(),
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
    password: newPassword(),
    'repeat-password': newPassword(),
  })
  .refine(data => data.password === data['repeat-password'], {
    path: ['repeat-password'],
  })

export const changePasswordSchema = z.object({
  // Current password: verified by compare() against the stored hash, so no
  // minimum-length policy is enforced here (only non-empty) — an already-stored
  // legacy short password must still pass.
  password: z.string().min(1),
  new_password: newPassword(),
})

export const consentSchema = z.object({
  purpose: z.string().min(1),
})

// A 6-digit TOTP code. Whitespace is trimmed so pasted codes with stray spaces
// still validate.
export const twoFactorCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type SetupInput = z.infer<typeof setupSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ConsentInput = z.infer<typeof consentSchema>
export type TwoFactorCodeInput = z.infer<typeof twoFactorCodeSchema>
