import { describe, expect, it } from 'vitest'
import { reorderPartIds } from './EventPartsCard'

describe('reorderPartIds', () => {
  it('returns the same order when moving an id onto itself', () => {
    expect(reorderPartIds([1, 2, 3], 2, 2)).toEqual([1, 2, 3])
  })

  it('moves an id downward when dropped onto a later position', () => {
    expect(reorderPartIds([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4])
  })

  it('moves an id upward when dropped onto an earlier position', () => {
    expect(reorderPartIds([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3])
  })
})
