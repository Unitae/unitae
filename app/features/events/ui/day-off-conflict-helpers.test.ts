import { describe, expect, it } from 'vitest'
import { pickConflictModalTitle } from './day-off-conflict-helpers'

describe('pickConflictModalTitle', () => {
  it('picks the singular title for a single conflict', () => {
    const result = pickConflictModalTitle(1, {
      singular: () => 'singular-copy',
      plural: n => `plural-copy-${n}`,
    })
    expect(result).toBe('singular-copy')
  })

  it('picks the plural title for two or more conflicts, forwarding the count', () => {
    const result = pickConflictModalTitle(3, {
      singular: () => 'singular-copy',
      plural: n => `plural-copy-${n}`,
    })
    expect(result).toBe('plural-copy-3')
  })

  // Guarding zero is defensive — the modal only renders when there is at
  // least one conflict, but the helper must be total to keep call sites
  // typed and simple.
  it('picks the plural title for zero conflicts (defensive)', () => {
    const result = pickConflictModalTitle(0, {
      singular: () => 'singular-copy',
      plural: n => `plural-copy-${n}`,
    })
    expect(result).toBe('plural-copy-0')
  })
})
