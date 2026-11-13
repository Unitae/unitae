import { describe, expect, it } from 'vitest'
import { programmeWeeks } from './programme-weeks'

const unit = (iso: string) => ({ event: { startDate: new Date(iso) } })
// Friday 13 November 2026, mid-morning in Paris.
const now = new Date('2026-11-13T09:00:00Z')

describe('programmeWeeks', () => {
  it('groups the meetings by their Monday, in the congregation’s time zone', () => {
    // Sunday 15 November at 23:30 in Paris is still that Sunday there; at 00:30 it is Monday the 16th.
    const weeks = programmeWeeks(
      [unit('2026-11-12T18:00:00Z'), unit('2026-11-15T22:30:00Z'), unit('2026-11-15T23:30:00Z')],
      now,
      'Europe/Paris',
    )
    expect(weeks.map(week => [week.monday, week.units.length])).toEqual([
      ['2026-11-09', 2],
      ['2026-11-16', 1],
    ])
  })

  it('says which week is under way and which are over', () => {
    const weeks = programmeWeeks(
      [unit('2026-11-05T18:00:00Z'), unit('2026-11-12T18:00:00Z'), unit('2026-11-19T18:00:00Z')],
      now,
      'Europe/Paris',
    )
    expect(weeks.map(week => ({ monday: week.monday, current: week.current, past: week.past }))).toEqual([
      { monday: '2026-11-02', current: false, past: true },
      { monday: '2026-11-09', current: true, past: false },
      { monday: '2026-11-16', current: false, past: false },
    ])
  })

  it('keeps the meetings in the order they came', () => {
    const weeks = programmeWeeks([unit('2026-11-14T09:00:00Z'), unit('2026-11-12T18:00:00Z')], now, 'Europe/Paris')
    expect(weeks[0].units.map(u => u.event.startDate.toISOString())).toEqual([
      '2026-11-14T09:00:00.000Z',
      '2026-11-12T18:00:00.000Z',
    ])
  })
})
