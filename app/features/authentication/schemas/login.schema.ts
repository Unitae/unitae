import { z } from 'zod'
import * as m from '~/i18n/paraglide/messages'

// Password length policy, shared across every set-password flow. The lower bound
// is the unified minimum. The upper bound caps input before it reaches the
// CPU-bound zxcvbn estimator (see password-strength.server) so a multi-KB
// password on the public register/setup/reset endpoints cannot stall the event
// loop. login stays uncapped on purpose — it only feeds a fixed-cost hash
// compare, and a max there could lock out an already-stored long password.
const MIN_PASSWORD_LENGTH = 8
const SIX_DIGITS = /^\d{6}$/
export const MAX_PASSWORD_LENGTH = 128

// The messages are functions: Paraglide reads the request's locale when a field is checked, not when this file loads.
const required = () => m.auth_error_required()

const newPassword = () =>
  z
    .string({ error: required })
    .min(MIN_PASSWORD_LENGTH, { error: () => m.auth_error_password_short() })
    .max(MAX_PASSWORD_LENGTH, { error: () => m.auth_error_password_long() })

const email = () =>
  z
    .string({ error: required })
    .trim()
    .email({ error: () => m.auth_error_email() })

const congregationName = () =>
  z
    .string({ error: required })
    .trim()
    .min(2, { error: () => m.auth_error_name_short() })

export const loginSchema = z.object({
  email: email(),
  password: z.string({ error: required }).min(1, { error: required }),
})

export const forgotPasswordSchema = z.object({
  email: email(),
})

// Changing a password on its own: typed twice, so that a typo does not lock the account out.
export const resetPasswordSchema = z
  .object({
    email: email(),
    password: newPassword(),
    passwordConfirm: z.string({ error: required }),
  })
  .refine(data => data.password === data.passwordConfirm, {
    path: ['passwordConfirm'],
    error: () => m.auth_error_password_mismatch(),
  })

// Creating a congregation: one password field, with « Afficher » to check it.
export const registerSchema = z.object({
  'congregation-name': congregationName(),
  locale: z.string().default('fr'),
  email: email(),
  password: newPassword(),
})

export const setupSchema = z.object({
  'congregation-name': congregationName(),
  email: email(),
  locale: z.string().default('fr'),
  password: newPassword(),
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
    .string({ error: required })
    .trim()
    .regex(SIX_DIGITS, { error: () => m.auth_error_code() }),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type SetupInput = z.infer<typeof setupSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ConsentInput = z.infer<typeof consentSchema>
export type TwoFactorCodeInput = z.infer<typeof twoFactorCodeSchema>
