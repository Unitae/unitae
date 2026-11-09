import { describe, expect, it } from 'vitest'

import { absencePeriod, presetEnd, selectedPreset } from './absence-period'

// The absences page reads a period of days in the congregation's zone: from today to the end of next month unless the
// address says otherwise, never longer than a year, and never ending before it starts.

const TODAY = '2026-11-09'
const params = (entries: Record<string, string>) => new URLSearchParams(entries)

describe('absencePeriod', () => {
  it('runs from today to the end of next month by default', () => {
    expect(absencePeriod(params({}), TODAY)).toEqual({ from: '2026-11-09', to: '2026-12-31' })
  })

  it('reads the days the address names', () => {
    expect(absencePeriod(params({ from: '2026-11-16', to: '2027-01-10' }), TODAY)).toEqual({
      from: '2026-11-16',
      to: '2027-01-10',
    })
  })

  // A preset stays relative: a bookmarked « 4 prochaines semaines » still starts today next month.
  it('reads a preset as starting today', () => {
    expect(absencePeriod(params({ period: '4-weeks', from: '2026-01-01' }), TODAY)).toEqual({
      from: '2026-11-09',
      to: '2026-12-06',
    })
    expect(absencePeriod(params({ period: 'forever' }), TODAY)).toEqual({ from: '2026-11-09', to: '2026-12-31' })
  })

  it('falls back on the default for a day that does not exist', () => {
    expect(absencePeriod(params({ from: '2026-02-30', to: 'soon' }), TODAY)).toEqual({
      from: '2026-11-09',
      to: '2026-12-31',
    })
  })

  it('never ends before it starts', () => {
    expect(absencePeriod(params({ from: '2026-12-10', to: '2026-12-01' }), TODAY)).toEqual({
      from: '2026-12-10',
      to: '2026-12-10',
    })
  })

  // The page lists every week of the period: an address spanning centuries would render thousands of them.
  it('stops a year after it starts', () => {
    expect(absencePeriod(params({ from: '2026-11-09', to: '2099-12-31' }), TODAY)).toEqual({
      from: '2026-11-09',
      to: '2027-11-08',
    })
  })
})

describe('presetEnd', () => {
  it('ends the day before the same weekday four weeks later', () => {
    expect(presetEnd('4-weeks', TODAY)).toBe('2026-12-06')
  })

  it('ends on the last day of next month, across a year end', () => {
    expect(presetEnd('next-month', TODAY)).toBe('2026-12-31')
    expect(presetEnd('next-month', '2026-12-15')).toBe('2027-01-31')
    expect(presetEnd('next-month', '2027-01-31')).toBe('2027-02-28')
  })

  it('ends the day before the same date three months later', () => {
    expect(presetEnd('3-months', TODAY)).toBe('2027-02-08')
  })
})

describe('selectedPreset', () => {
  it('names the choice a period from today matches', () => {
    expect(selectedPreset({ from: TODAY, to: '2026-12-31' }, TODAY)).toBe('next-month')
    expect(selectedPreset({ from: TODAY, to: '2026-12-06' }, TODAY)).toBe('4-weeks')
  })

  it('names none for days picked by hand', () => {
    expect(selectedPreset({ from: '2026-11-16', to: '2026-12-31' }, TODAY)).toBeNull()
    expect(selectedPreset({ from: TODAY, to: '2026-12-20' }, TODAY)).toBeNull()
  })
})
