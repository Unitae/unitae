import { describe, expect, it } from 'vitest'
import { accountDisplayName, displayFirstname, fullName } from './display-name'

describe('fullName', () => {
  it('concatenates firstname and lastname', () => {
    expect(fullName({ firstname: 'Marie', lastname: 'Dubois' })).toBe('Marie Dubois')
  })

  it('trims when a component is missing', () => {
    expect(fullName({ firstname: 'Marie', lastname: null })).toBe('Marie')
    expect(fullName({ firstname: null, lastname: 'Dubois' })).toBe('Dubois')
  })

  it('returns an empty string when both are missing', () => {
    expect(fullName({ firstname: null, lastname: null })).toBe('')
  })
})

describe('accountDisplayName', () => {
  it('prefers the linked Member over the account name', () => {
    expect(
      accountDisplayName({
        firstname: 'Account',
        lastname: 'Fallback',
        member: { firstname: 'Marie', lastname: 'Dubois' },
      }),
    ).toBe('Marie Dubois')
  })

  it('falls back to the account name when there is no linked Member', () => {
    expect(accountDisplayName({ firstname: 'Admin', lastname: 'User', member: null })).toBe('Admin User')
  })
})

describe('displayFirstname', () => {
  it('prefers the linked Member firstname over the account firstname', () => {
    expect(displayFirstname({ firstname: 'AccountName', member: { firstname: 'MemberName' } })).toBe('MemberName')
  })

  it('falls back to the account firstname when no Member is linked', () => {
    expect(displayFirstname({ firstname: 'AccountName', member: null })).toBe('AccountName')
  })

  it('returns null when neither source has a firstname', () => {
    expect(displayFirstname({ firstname: null, member: null })).toBeNull()
    expect(displayFirstname({ firstname: '', member: null })).toBeNull()
  })

  it('falls back through an empty Member firstname to the account firstname', () => {
    expect(displayFirstname({ firstname: 'AccountName', member: { firstname: '' } })).toBe('AccountName')
  })
})
