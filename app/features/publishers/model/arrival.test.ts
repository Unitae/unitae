import { describe, expect, it } from 'vitest'
import { arrivalOnReturn } from './arrival'

describe('arrivalOnReturn', () => {
  const returnedOn = new Date('2026-11-01T00:00:00Z')

  // Coming back after more than a year away warrants a welcome visit, like a first arrival.
  it('counts a return after more than a year away as an arrival, on the return day', () => {
    expect(arrivalOnReturn(new Date('2025-10-31T10:00:00Z'), returnedOn)).toEqual(returnedOn)
  })

  // An arrival date is a calendar day stored at UTC midnight, like the one the publisher form saves.
  it('records the return as a calendar day, whatever the time it was given at', () => {
    expect(arrivalOnReturn(new Date('2025-10-31T10:00:00Z'), new Date('2026-11-01T21:30:00Z'))).toEqual(returnedOn)
  })

  it('does not count a return within the year', () => {
    expect(arrivalOnReturn(new Date('2025-11-02T10:00:00Z'), returnedOn)).toBeNull()
  })

  it('does not count a member who never left', () => {
    expect(arrivalOnReturn(null, returnedOn)).toBeNull()
  })
})
