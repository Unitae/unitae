import { describe, expect, it } from 'vitest'
import { LastAdminError } from '~/shared/auth/permissions.server'
import { OwnAccountError } from '~/shared/domain/account-protection.server'
import { GrantBeyondActorError } from '~/shared/domain/role-grant-limits.server'
import { accountRefusal } from './_account-refusal.server'

describe('accountRefusal', () => {
  it('says why an action on an account was refused', () => {
    const refusals = [new OwnAccountError(), new LastAdminError(), new GrantBeyondActorError()].map(accountRefusal)
    expect(refusals.every(text => typeof text === 'string' && text.length > 0)).toBe(true)
    expect(new Set(refusals).size).toBe(3)
  })

  it('says nothing for an error that is not a refusal', () => {
    expect(accountRefusal(new Error('database down'))).toBeNull()
    expect(accountRefusal(null)).toBeNull()
  })
})
