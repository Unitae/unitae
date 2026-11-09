import { describe, expect, it } from 'vitest'

import { elapsedPercent } from './elapsed-percent'

describe('elapsedPercent', () => {
  const start = new Date(2026, 0, 1)
  const due = new Date(2026, 0, 11)

  it('measures how much of the loan period has passed', () => {
    expect(elapsedPercent(start, due, new Date(2026, 0, 6))).toBe(50)
  })

  it('stays within 0 and 100', () => {
    expect(elapsedPercent(start, due, new Date(2025, 11, 1))).toBe(0)
    expect(elapsedPercent(start, due, new Date(2026, 2, 1))).toBe(100)
  })

  it('reads as complete when the due date is not after the start', () => {
    expect(elapsedPercent(start, start, new Date(2026, 0, 1))).toBe(100)
  })
})
