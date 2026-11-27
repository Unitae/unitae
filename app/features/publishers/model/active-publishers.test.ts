import { describe, expect, it } from 'vitest'

import { activeWindow } from './active-publishers'

describe('activeWindow', () => {
  it('is the month and the five before it, oldest first', () => {
    expect(activeWindow(9, 2026)).toEqual([
      { year: 2026, month: 4 },
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ])
  })

  it('reaches back into the year before', () => {
    expect(activeWindow(1, 2027)).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2027, month: 0 },
      { year: 2027, month: 1 },
    ])
  })
})
