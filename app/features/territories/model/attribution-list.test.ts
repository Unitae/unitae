import { describe, expect, it } from 'vitest'

import {
  type AttributionState,
  attributionState,
  parseAttributionView,
  sortAttributions,
  viewCounts,
} from './attribution-list'

// An open attribution as the managers' list reads it: whose it is, whether its clock runs, how close its due day is;
// the four views over those states; and the orders the list offers.

describe('attributionState', () => {
  const today = '2026-11-09'

  it('is overdue from its due day on, due soon within two weeks of it, on time before', () => {
    expect(attributionState({ today, lateDay: '2026-11-09', paused: false, gone: false })).toBe('overdue')
    expect(attributionState({ today, lateDay: '2026-08-25', paused: false, gone: false })).toBe('overdue')
    expect(attributionState({ today, lateDay: '2026-11-10', paused: false, gone: false })).toBe('due-soon')
    expect(attributionState({ today, lateDay: '2026-11-23', paused: false, gone: false })).toBe('due-soon')
    expect(attributionState({ today, lateDay: '2026-11-24', paused: false, gone: false })).toBe('on-time')
  })

  it('is paused whatever its due day: a campaign froze its clock', () => {
    expect(attributionState({ today, lateDay: '2026-08-25', paused: true, gone: false })).toBe('paused')
  })

  it('has no holder once its publisher left or was anonymised, before anything else', () => {
    expect(attributionState({ today, lateDay: '2026-12-25', paused: true, gone: true })).toBe('orphaned')
  })
})

describe('viewCounts', () => {
  it('counts every attribution once in « all », and each in the view of its state', () => {
    const states = ['overdue', 'overdue', 'orphaned', 'paused', 'due-soon', 'on-time'] as const
    expect(viewCounts(states)).toEqual({ all: 6, late: 2, paused: 1, orphaned: 1 })
  })
})

describe('parseAttributionView', () => {
  it('reads the view of the address, « all » otherwise', () => {
    expect(parseAttributionView(new URLSearchParams('view=late'))).toBe('late')
    expect(parseAttributionView(new URLSearchParams('view=nope'))).toBe('all')
    expect(parseAttributionView(new URLSearchParams(''))).toBe('all')
  })

  it('still opens the old links: ?status=late, ?status=orphaned, ?paused=true', () => {
    expect(parseAttributionView(new URLSearchParams('status=late'))).toBe('late')
    expect(parseAttributionView(new URLSearchParams('status=orphaned'))).toBe('orphaned')
    expect(parseAttributionView(new URLSearchParams('paused=true'))).toBe('paused')
  })
})

describe('sortAttributions', () => {
  const row = (
    number: string,
    startDay: string,
    distance?: number | null,
    lateDay = '2027-01-01',
    state: AttributionState = 'on-time',
  ) => ({
    territory: { number },
    startDay,
    distance,
    lateDay,
    state,
  })
  const numbers = (rows: { territory: { number: string } }[]) => rows.map(r => r.territory.number)

  it('puts the longest out first, then numbers in natural order on the same day', () => {
    const rows = [row('T10', '2026-05-12'), row('T2', '2026-05-12'), row('T3', '2026-04-25')]
    expect(numbers(sortAttributions(rows, 'date', 'fr'))).toEqual(['T3', 'T2', 'T10'])
  })

  it('puts those without a holder first, then the running ones by due day, most overdue first; the paused, which cannot be late, last', () => {
    const rows = [
      row('T1', '2026-01-01', null, '2026-12-20', 'on-time'),
      row('T2', '2026-01-01', null, '2026-08-01', 'paused'),
      row('T3', '2026-01-01', null, '2026-10-01', 'overdue'),
      row('T4', '2026-01-01', null, '2026-12-01', 'orphaned'),
      row('T5', '2026-01-01', null, '2026-11-20', 'due-soon'),
      row('T6', '2026-01-01', null, '2026-06-01', 'overdue'),
      row('T7', '2026-01-01', null, '2026-09-01', 'orphaned'),
      row('T8', '2026-01-01', null, '2026-07-01', 'paused'),
    ]
    expect(numbers(sortAttributions(rows, 'late', 'fr'))).toEqual(['T7', 'T4', 'T6', 'T3', 'T5', 'T1', 'T8', 'T2'])
  })

  it('breaks a tie in lateness by number', () => {
    const rows = [
      row('T10', '2026-01-01', null, '2026-10-01', 'overdue'),
      row('T2', '2026-01-01', null, '2026-10-01', 'overdue'),
    ]
    expect(numbers(sortAttributions(rows, 'late', 'fr'))).toEqual(['T2', 'T10'])
  })

  it('sorts numbers the way people count: T2 before T10', () => {
    const rows = [row('T10', '2026-01-01'), row('H1', '2026-01-01'), row('T2', '2026-01-01')]
    expect(numbers(sortAttributions(rows, 'number', 'fr'))).toEqual(['H1', 'T2', 'T10'])
  })

  it('puts the nearest first by proximity, those without a place last in number order', () => {
    const rows = [row('T5', '2026-01-01', null), row('T4', '2026-01-01', 900), row('T1', '2026-01-01', 120)]
    expect(numbers(sortAttributions(rows, 'proximity', 'fr'))).toEqual(['T1', 'T4', 'T5'])
  })
})
