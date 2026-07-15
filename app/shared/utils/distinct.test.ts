import { describe, expect, it } from 'vitest'
import { distinct } from './distinct'

describe('distinct', () => {
  it('returns [] for an empty array', () => {
    expect(distinct([])).toEqual([])
  })

  it('drops empty strings and duplicates', () => {
    expect(distinct(['a', '', 'b', 'a'])).toEqual(['a', 'b'])
  })

  it('sorts alphabetically using French locale (accents grouped)', () => {
    expect(distinct(['banane', 'ananas', 'école', 'éclair', 'zoo'])).toEqual([
      'ananas',
      'banane',
      'éclair',
      'école',
      'zoo',
    ])
  })

  it('keeps both cases when they differ (case-sensitive dedup)', () => {
    expect(distinct(['A', 'a'])).toHaveLength(2)
  })

  it('is stable when everything is empty', () => {
    expect(distinct(['', '', ''])).toEqual([])
  })
})
