import { describe, expect, it } from 'vitest'
import { accountStatus } from './account-status'

describe('accountStatus', () => {
  it('is active once the invitation was followed', () => {
    expect(accountStatus({ active: true, anonymized: false, passwordSet: true })).toBe('active')
  })

  it('waits on its invitation until a password is chosen', () => {
    expect(accountStatus({ active: true, anonymized: false, passwordSet: false })).toBe('invited')
  })

  it('says switched off before anything about the invitation', () => {
    expect(accountStatus({ active: false, anonymized: false, passwordSet: false })).toBe('deactivated')
  })

  it('says anonymised for an anonymised account, which is also switched off', () => {
    expect(accountStatus({ active: false, anonymized: true, passwordSet: false })).toBe('anonymized')
  })
})
