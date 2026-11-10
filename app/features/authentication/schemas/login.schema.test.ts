import { describe, expect, it } from 'vitest'

import * as m from '~/i18n/paraglide/messages'

import { changePasswordSchema, loginSchema, resetPasswordSchema, setupSchema } from './login.schema'

describe('changePasswordSchema', () => {
  it('accepts a current password of any non-empty length and a ≥8 new password', () => {
    const result = changePasswordSchema.safeParse({ password: 'x', new_password: 'a-strong-new-one' })

    expect(result.success).toBe(true)
  })

  // Regression for #292: the profile change-password action had no schema, so
  // an empty new_password was hashed and saved. The schema must reject it.
  it('rejects an empty new password (regression #292)', () => {
    const result = changePasswordSchema.safeParse({ password: 'current', new_password: '' })

    expect(result.success).toBe(false)
  })

  it('rejects a new password shorter than 8 characters', () => {
    const result = changePasswordSchema.safeParse({ password: 'current', new_password: 'short' })

    expect(result.success).toBe(false)
  })

  it('rejects an oversized new password (length is capped to bound the strength estimator)', () => {
    const result = changePasswordSchema.safeParse({ password: 'current', new_password: 'a'.repeat(129) })

    expect(result.success).toBe(false)
  })

  it('requires the current password to be present', () => {
    const result = changePasswordSchema.safeParse({ password: '', new_password: 'a-strong-new-one' })

    expect(result.success).toBe(false)
  })
})

describe('setupSchema', () => {
  const base = { 'congregation-name': 'Assemblée des Lilas', email: 'elder@example.org', locale: 'fr' }

  it('rejects a password shorter than 8 characters (unified policy)', () => {
    const result = setupSchema.safeParse({ ...base, password: 'short' })

    expect(result.success).toBe(false)
  })

  it('accepts a ≥8 password typed once, with « Afficher » to check it', () => {
    const result = setupSchema.safeParse({ ...base, password: 'a-strong-setup-pw' })

    expect(result.success).toBe(true)
  })

  it('wants the congregation’s name', () => {
    const result = setupSchema.safeParse({ ...base, 'congregation-name': ' ', password: 'a-strong-setup-pw' })

    expect(result.error?.issues.map(issue => issue.path.join('.'))).toEqual(['congregation-name'])
  })
})

describe('resetPasswordSchema', () => {
  const base = { email: 'elder@example.org', password: 'a-strong-reset-pw' }

  it('accepts the new password typed twice', () => {
    expect(resetPasswordSchema.safeParse({ ...base, passwordConfirm: 'a-strong-reset-pw' }).success).toBe(true)
  })

  it('says so under the confirmation when the two differ', () => {
    const result = resetPasswordSchema.safeParse({ ...base, passwordConfirm: 'a-strong-reset-xx' })

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['passwordConfirm'], message: m.auth_error_password_mismatch() }),
    ])
  })
})

describe('field messages', () => {
  it('speak the reader’s language, never the validator’s defaults', () => {
    const result = loginSchema.safeParse({ email: 'not-an-address', password: '' })

    expect(result.error?.issues.map(issue => issue.message)).toEqual([m.auth_error_email(), m.auth_error_required()])
  })
})
