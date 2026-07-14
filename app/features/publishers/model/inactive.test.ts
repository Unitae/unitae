import { describe, expect, it } from 'vitest'
import { wasInactiveDuring } from './inactive'

describe('wasInactiveDuring', () => {
  it('returns false when the member has no inactive flag', () => {
    expect(wasInactiveDuring(null, 2026, 3)).toBe(false)
  })

  it('returns false when the queried month precedes the inactive month in the same year', () => {
    const inactiveAt = new Date(2026, 6, 15) // 2026-07-15
    expect(wasInactiveDuring(inactiveAt, 2026, 5)).toBe(false) // June 2026
  })

  it('returns false when the queried year precedes the inactive year', () => {
    const inactiveAt = new Date(2026, 0, 15) // 2026-01-15
    expect(wasInactiveDuring(inactiveAt, 2025, 11)).toBe(false) // December 2025
  })

  it('returns true when the queried month matches the inactive month', () => {
    const inactiveAt = new Date(2026, 6, 15) // 2026-07-15
    expect(wasInactiveDuring(inactiveAt, 2026, 6)).toBe(true) // July 2026
  })

  it('returns true when the queried month follows the inactive month in the same year', () => {
    const inactiveAt = new Date(2026, 6, 15) // 2026-07-15
    expect(wasInactiveDuring(inactiveAt, 2026, 8)).toBe(true) // September 2026
  })

  it('returns true when the queried year follows the inactive year', () => {
    const inactiveAt = new Date(2025, 10, 20) // 2025-11-20
    expect(wasInactiveDuring(inactiveAt, 2026, 0)).toBe(true) // January 2026
  })
})
