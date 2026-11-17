import { describe, expect, it } from 'vitest'
import { attendanceLineItems } from './attendance-line'

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
      ),
    ).toBe('jeudi 12 nov. — · dimanche 15 nov. 119')
  })

  it('words the days in the reader’s language', () => {
    expect(attendanceLineItems([{ day: '2026-11-15', total: 119 }], 'en')).toBe('Sunday, Nov 15 119')
  })
})
