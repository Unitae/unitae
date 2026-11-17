import { describe, expect, it } from 'vitest'
import { attendanceLineItems, sheetShowsAttendance } from './attendance-line'

describe('attendanceLineItems', () => {
  // « Assistance la semaine passée : jeudi 12 nov. — · dimanche 15 nov. 119 »
  it('names each meeting by its local day, with its total or « — » when incomplete', () => {
    expect(
      attendanceLineItems(
        [
          { day: '2026-11-12', total: null },
          { day: '2026-11-15', total: 119 },
        ],
        'fr',
        (day, total) => `${day} ${total}`,
      ),
    ).toBe('jeudi 12 nov. — · dimanche 15 nov. 119')
  })

  // In English the total needs a separator, which the message gives: « Sunday, Nov 15: 119 ».
  it('words the days in the reader’s language, with the message’s own separator', () => {
    expect(attendanceLineItems([{ day: '2026-11-15', total: 119 }], 'en', (day, total) => `${day}: ${total}`)).toBe(
      'Sunday, Nov 15: 119',
    )
  })
})

describe('sheetShowsAttendance', () => {
  const asOf = new Date('2026-11-17T09:00:00Z')
  const thisWeek = { startDate: new Date('2026-11-19T18:00:00Z') }
  const later = { startDate: new Date('2026-12-03T18:00:00Z') }

  // The sheet follows the screen: the line belongs to the week under way, so only a sheet by date that holds it.
  it('prints the line only on a sheet by date holding a meeting of the week under way', () => {
    expect(sheetShowsAttendance({ events: [thisWeek, later], groupBy: 'date', asOf, timeZone: 'Europe/Paris' })).toBe(
      true,
    )
    expect(sheetShowsAttendance({ events: [later], groupBy: 'date', asOf, timeZone: 'Europe/Paris' })).toBe(false)
    expect(sheetShowsAttendance({ events: [thisWeek], groupBy: 'template', asOf, timeZone: 'Europe/Paris' })).toBe(
      false,
    )
  })
})
