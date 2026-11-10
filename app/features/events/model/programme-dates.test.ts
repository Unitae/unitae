import { describe, expect, it } from 'vitest'
import { daysOnWeekday, programmeKey } from './programme-dates'

describe('daysOnWeekday', () => {
  it('lists every day of the weekday in the period, both ends included', () => {
    expect(daysOnWeekday(4, '2026-11-12', '2026-11-26')).toEqual(['2026-11-12', '2026-11-19', '2026-11-26'])
  })

  it('starts on the first matching day after the start', () => {
    expect(daysOnWeekday(4, '2026-11-09', '2026-11-22')).toEqual(['2026-11-12', '2026-11-19'])
  })

  it('reads Sunday as 0, like the templates', () => {
    expect(daysOnWeekday(0, '2026-12-28', '2027-01-10')).toEqual(['2027-01-03', '2027-01-10'])
  })

  it('keeps a week between days across a change of summer time', () => {
    expect(daysOnWeekday(0, '2026-10-20', '2026-11-05')).toEqual(['2026-10-25', '2026-11-01'])
  })

  it('is empty when no day of the period falls on the weekday', () => {
    expect(daysOnWeekday(4, '2026-11-13', '2026-11-18')).toEqual([])
  })

  it('is empty when the period ends before it starts', () => {
    expect(daysOnWeekday(4, '2026-11-19', '2026-11-12')).toEqual([])
  })
})

describe('programmeKey', () => {
  it('names a template on a day', () => {
    expect(programmeKey(270, '2026-11-12')).toBe('270:2026-11-12')
  })
})
