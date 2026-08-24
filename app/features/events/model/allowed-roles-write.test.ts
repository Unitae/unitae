import { describe, expect, it } from 'vitest'
import { MANAGED_ROLE_SLOTS_FIELD, partAllowedRolesToWrite } from './allowed-roles-write'

describe('partAllowedRolesToWrite', () => {
  it('sends both slots when the editor rendered both pickers', () => {
    expect(
      partAllowedRolesToWrite({
        managedSlots: ['speaker', 'reader'],
        allowedSpeakerRoleIds: [4],
        allowedReaderRoleIds: [9],
      }),
    ).toEqual({ allowedSpeakerRoleIds: [4], allowedReaderRoleIds: [9] })
  })

  it('omits the reader slot when its picker was never rendered', () => {
    // The regression this exists for: a kind with no reader slot hides the
    // reader picker, an unrendered picker submits nothing, and the schema
    // turns that absence into []. Writing [] deletes the restriction the part
    // already carried — see the reader half of 78a9219.
    expect(
      partAllowedRolesToWrite({
        managedSlots: ['speaker'],
        allowedSpeakerRoleIds: [4],
        allowedReaderRoleIds: [],
      }),
    ).toEqual({ allowedSpeakerRoleIds: [4] })
  })

  it('distinguishes a cleared picker from an absent one', () => {
    // Both arrive as [], so only the declared slot list can tell them apart.
    // Rendered and emptied must clear; never rendered must not.
    const cleared = partAllowedRolesToWrite({
      managedSlots: ['speaker', 'reader'],
      allowedSpeakerRoleIds: [],
      allowedReaderRoleIds: [],
    })
    const absent = partAllowedRolesToWrite({
      managedSlots: ['speaker'],
      allowedSpeakerRoleIds: [],
      allowedReaderRoleIds: [],
    })

    expect(cleared.allowedReaderRoleIds).toEqual([])
    expect(absent).not.toHaveProperty('allowedReaderRoleIds')
  })

  it('omits everything when the editor declared no slots at all', () => {
    // A caller that manages no eligibility must leave every stored row alone,
    // rather than silently clearing both slots.
    expect(
      partAllowedRolesToWrite({
        managedSlots: [],
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
      }),
    ).toEqual({})
  })

  it('ignores a slot name it does not recognise', () => {
    // The value crosses an HTTP boundary, so it is attacker-controlled text
    // rather than a trusted enum.
    expect(
      partAllowedRolesToWrite({
        managedSlots: ['speaker', 'conductor'],
        allowedSpeakerRoleIds: [4],
        allowedReaderRoleIds: [9],
      }),
    ).toEqual({ allowedSpeakerRoleIds: [4] })
  })

  it('names the form field once, so the sheet and the schema cannot drift', () => {
    expect(MANAGED_ROLE_SLOTS_FIELD).toBe('managedRoleSlots')
  })
})
