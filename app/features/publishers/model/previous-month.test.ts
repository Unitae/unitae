import { describe, expect, it } from 'vitest'
import { previousMonth } from './previous-month'

describe('previousMonth', () => {
  it('decrements the month within the same year', () => {
    expect(previousMonth({ month: 5, year: 2026 })).toEqual({ month: 4, year: 2026 })
  })

  it('wraps from January to December of the previous year', () => {
    expect(previousMonth({ month: 0, year: 2026 })).toEqual({ month: 11, year: 2025 })
  })
})
