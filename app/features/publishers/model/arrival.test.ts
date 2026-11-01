import { describe, expect, it } from 'vitest'
import { arrivalOnReturn } from './arrival'

describe('arrivalOnReturn', () => {
  const now = new Date(2026, 10, 1)

  // Coming back after more than a year away warrants a welcome visit, like a first arrival.
  it('counts a return after more than a year away as an arrival, on the return date', () => {
    expect(arrivalOnReturn(new Date(2025, 9, 31), now)).toEqual(now)
  })

  it('does not count a return within the year', () => {
    expect(arrivalOnReturn(new Date(2025, 10, 2), now)).toBeNull()
  })

  it('does not count a member who never left', () => {
    expect(arrivalOnReturn(null, now)).toBeNull()
  })
})
