import { describe, expect, it } from 'vitest'
import { partAllowedRolesToWrite, resolveAllowedRoleIds } from './allowed-roles-resolution'

describe('resolveAllowedRoleIds', () => {
  it('uses the preset roles when it has any', () => {
    expect(resolveAllowedRoleIds({ partRoleIds: [1, 2], presetRoleIds: [7, 8] })).toEqual([7, 8])
  })

  it('falls back to the part when the preset has none', () => {
    // Empty does not mean "nobody" — resolveEligibleUserIds reads an empty list
    // as "any member". Treating an unconfigured preset as authoritative would
    // silently hand every part using it the widest possible audience.
    expect(resolveAllowedRoleIds({ partRoleIds: [1, 2], presetRoleIds: [] })).toEqual([1, 2])
  })

  it('leaves an unrestricted part unrestricted', () => {
    expect(resolveAllowedRoleIds({ partRoleIds: [], presetRoleIds: [] })).toEqual([])
  })

  it('lets a preset narrow a part that had no restriction', () => {
    expect(resolveAllowedRoleIds({ partRoleIds: [], presetRoleIds: [7] })).toEqual([7])
  })

  it('cannot be used to remove a restriction the part carries', () => {
    // The deliberate asymmetry with allowExternalSpeaker, where the preset can
    // say no. Here "no roles" is the widest setting rather than the narrowest,
    // so an empty preset can only ever mean "not configured".
    expect(resolveAllowedRoleIds({ partRoleIds: [1], presetRoleIds: [] })).toEqual([1])
  })

  it('does not merge the two sides', () => {
    // A union would let a part quietly widen what its kind permits.
    expect(resolveAllowedRoleIds({ partRoleIds: [1, 2], presetRoleIds: [3] })).toEqual([3])
  })
})

describe('partAllowedRolesToWrite', () => {
  it('passes both slots through when the part has no kind', () => {
    expect(
      partAllowedRolesToWrite({ partPresetId: null, allowedSpeakerRoleIds: [3], allowedReaderRoleIds: [4] }),
    ).toEqual({ allowedSpeakerRoleIds: [3], allowedReaderRoleIds: [4] })
  })

  it('passes an emptied selection through, so clearing still works', () => {
    expect(
      partAllowedRolesToWrite({ partPresetId: null, allowedSpeakerRoleIds: [], allowedReaderRoleIds: [] }),
    ).toEqual({ allowedSpeakerRoleIds: [], allowedReaderRoleIds: [] })
  })

  it('omits both slots when a kind owns eligibility', () => {
    // Not [] — the part's own rows are the kind's fallback and must survive.
    expect(partAllowedRolesToWrite({ partPresetId: 55, allowedSpeakerRoleIds: [], allowedReaderRoleIds: [] })).toEqual(
      {},
    )
  })
})
