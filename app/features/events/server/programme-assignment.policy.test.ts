import { describe, expect, it } from 'vitest'
import { ConflictError } from '~/shared/errors/app-error.server'
import {
  areParticipantsDistinct,
  assertDistinctParticipants,
  checkAssignmentExists,
  checkEligibleForRole,
  checkExternalSpeakerValid,
  checkNoDayOffConflict,
  PROGRAMME_ASSIGNMENT_ERRORS,
} from './programme-assignment.policy'

describe('areParticipantsDistinct', () => {
  it('returns true when both null', () => {
    expect(areParticipantsDistinct(null, null)).toBe(true)
  })

  it('returns true when assignee null, assistant set', () => {
    expect(areParticipantsDistinct(null, 5)).toBe(true)
  })

  it('returns true when assistant null, assignee set', () => {
    expect(areParticipantsDistinct(5, null)).toBe(true)
  })

  it('returns true for two distinct ids', () => {
    expect(areParticipantsDistinct(5, 6)).toBe(true)
  })

  it('returns false when assignee and assistant are the same person', () => {
    expect(areParticipantsDistinct(5, 5)).toBe(false)
  })
})

describe('assertDistinctParticipants', () => {
  it('does not throw for distinct ids', () => {
    expect(() => assertDistinctParticipants(5, 6)).not.toThrow()
  })

  it('does not throw when either side is null', () => {
    expect(() => assertDistinctParticipants(null, null)).not.toThrow()
    expect(() => assertDistinctParticipants(null, 5)).not.toThrow()
    expect(() => assertDistinctParticipants(5, null)).not.toThrow()
  })

  it('throws ConflictError when assignee and assistant are the same person', () => {
    expect(() => assertDistinctParticipants(5, 5)).toThrow(ConflictError)
  })
})

describe('checkAssignmentExists', () => {
  it('returns null when the assignment is present', () => {
    expect(checkAssignmentExists({ id: 1 })).toBeNull()
  })

  it('returns a rejection when the assignment is null', () => {
    expect(checkAssignmentExists(null)).toEqual({ error: PROGRAMME_ASSIGNMENT_ERRORS.assignmentNotFound })
  })
})

describe('checkExternalSpeakerValid', () => {
  it('returns null for an active external speaker', () => {
    expect(checkExternalSpeakerValid({ archivedAt: null })).toBeNull()
  })

  it('returns a rejection when the speaker is missing', () => {
    expect(checkExternalSpeakerValid(null)).toEqual({ error: PROGRAMME_ASSIGNMENT_ERRORS.externalSpeakerInvalid })
  })

  it('returns a rejection when the speaker is archived', () => {
    expect(checkExternalSpeakerValid({ archivedAt: new Date('2024-01-01') })).toEqual({
      error: PROGRAMME_ASSIGNMENT_ERRORS.externalSpeakerInvalid,
    })
  })
})

describe('checkEligibleForRole', () => {
  it('returns null when the assignee is in the eligible set', () => {
    expect(checkEligibleForRole([1, 2, 3], 2, 'speaker')).toBeNull()
  })

  it('returns the speaker rejection when ineligible as speaker', () => {
    expect(checkEligibleForRole([1, 2], 3, 'speaker')).toEqual({
      error: PROGRAMME_ASSIGNMENT_ERRORS.ineligibleSpeaker,
    })
  })

  it('returns the reader rejection when ineligible as reader', () => {
    expect(checkEligibleForRole([1, 2], 3, 'reader')).toEqual({
      error: PROGRAMME_ASSIGNMENT_ERRORS.ineligibleReader,
    })
  })

  it('returns the servant rejection when ineligible as servant', () => {
    expect(checkEligibleForRole([1, 2], 3, 'servant')).toEqual({
      error: PROGRAMME_ASSIGNMENT_ERRORS.ineligibleServant,
    })
  })
})

describe('checkNoDayOffConflict', () => {
  it('returns null when there is no conflict', () => {
    expect(checkNoDayOffConflict(false, 'speaker')).toBeNull()
  })

  it('returns the speaker day-off rejection', () => {
    expect(checkNoDayOffConflict(true, 'speaker')).toEqual({ error: PROGRAMME_ASSIGNMENT_ERRORS.dayOffSpeaker })
  })

  it('returns the reader day-off rejection', () => {
    expect(checkNoDayOffConflict(true, 'reader')).toEqual({ error: PROGRAMME_ASSIGNMENT_ERRORS.dayOffReader })
  })

  it('returns the servant day-off rejection', () => {
    expect(checkNoDayOffConflict(true, 'servant')).toEqual({ error: PROGRAMME_ASSIGNMENT_ERRORS.dayOffServant })
  })
})
