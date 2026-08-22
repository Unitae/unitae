import { describe, expect, it } from 'vitest'
import { resolveAllowedRoleIds } from './allowed-roles-resolution'

describe('resolveAllowedRoleIds', () => {
  it('uses the preset roles when it has any', () => {
    expect(resolveAllowedRoleIds([1, 2], [7, 8])).toEqual([7, 8])
  })

  it('falls back to the part when the preset has none', () => {
    // Empty does not mean "nobody" — resolveEligibleUserIds reads an empty list
    // as "any member". Treating an unconfigured preset as authoritative would
    // silently hand every part using it the widest possible audience.
    expect(resolveAllowedRoleIds([1, 2], [])).toEqual([1, 2])
  })

  it('leaves an unrestricted part unrestricted', () => {
    expect(resolveAllowedRoleIds([], [])).toEqual([])
  })

  it('lets a preset narrow a part that had no restriction', () => {
    expect(resolveAllowedRoleIds([], [7])).toEqual([7])
  })

  it('cannot be used to remove a restriction the part carries', () => {
    // The deliberate asymmetry with allowExternalSpeaker, where the preset can
    // say no. Here "no roles" is the widest setting rather than the narrowest,
    // so an empty preset can only ever mean "not configured".
    expect(resolveAllowedRoleIds([1], [])).toEqual([1])
  })

  it('does not merge the two sides', () => {
    // A union would let a part quietly widen what its kind permits.
    expect(resolveAllowedRoleIds([1, 2], [3])).toEqual([3])
  })
})
