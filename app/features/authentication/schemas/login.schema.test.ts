import { describe, expect, it } from 'vitest'

import { changePasswordSchema, setupSchema } from './login.schema'

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

  it('requires the current password to be present', () => {
    const result = changePasswordSchema.safeParse({ password: '', new_password: 'a-strong-new-one' })

    expect(result.success).toBe(false)
  })
})

describe('setupSchema', () => {
  const base = { email: 'elder@example.org', locale: 'fr' }

  it('rejects a password shorter than 8 characters (unified policy)', () => {
    const result = setupSchema.safeParse({ ...base, password: 'short', 'repeat-password': 'short' })

    expect(result.success).toBe(false)
  })

  it('accepts a ≥8 password with a matching confirmation', () => {
    const result = setupSchema.safeParse({
      ...base,
      password: 'a-strong-setup-pw',
      'repeat-password': 'a-strong-setup-pw',
    })

    expect(result.success).toBe(true)
  })

  it('rejects when the confirmation does not match', () => {
    const result = setupSchema.safeParse({
      ...base,
      password: 'a-strong-setup-pw',
      'repeat-password': 'a-strong-setup-xx',
    })

    expect(result.success).toBe(false)
  })
})
