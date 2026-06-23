import { describe, expect, it } from 'vitest'
import { ConflictError } from '~/shared/errors/app-error.server'
import { areParticipantsDistinct, assertDistinctParticipants } from './programme-assignment.policy'

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
