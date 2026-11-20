import { describe, expect, it } from 'vitest'
import { pickStudentPart, rankDemoPublishers } from './demo-publisher'

const facts = (roles: number[], holding: number[], coming: [number, number][]) => ({
  roles: new Set(roles),
  holding: new Set(holding),
  coming: new Map(coming),
})

// The publisher a visitor tries the demo as: a plain publisher (or pioneer) holding no role in the congregation, with
// a territory in hand and the most coming assignments, so every page a publisher sees has something on it.
describe('rankDemoPublishers', () => {
  it('leaves out anyone who holds a role in the congregation, however busy', () => {
    expect(
      rankDemoPublishers(
        [1, 2, 3],
        facts(
          [1, 2],
          [1, 2, 3],
          [
            [1, 9],
            [2, 7],
          ],
        ),
      ),
    ).toEqual([3])
  })

  it('puts one with a territory in hand first, then the most coming assignments', () => {
    expect(
      rankDemoPublishers(
        [1, 2, 3],
        facts(
          [],
          [2, 3],
          [
            [1, 9],
            [2, 1],
            [3, 4],
          ],
        ),
      ),
    ).toEqual([3, 2, 1])
  })

  it('breaks a tie the same way every time', () => {
    expect(rankDemoPublishers([7, 6], facts([], [], []))).toEqual([6, 7])
  })
})

describe('pickStudentPart', () => {
  const day = (date: string) => new Date(`${date}T19:00:00Z`)
  const part = (id: number, date: string, published = true) => ({ id, startDate: day(date), published })

  it('takes the first published part', () => {
    expect(pickStudentPart([part(1, '2026-11-26', false), part(2, '2026-12-03'), part(3, '2026-11-27')], [])).toBe(3)
  })

  it('skips a part on a day the publisher is away', () => {
    const away = [{ startDate: day('2026-11-25'), endDate: day('2026-11-28') }]
    expect(pickStudentPart([part(1, '2026-11-26'), part(2, '2026-12-03')], away)).toBe(2)
  })

  it('falls back to a draft programme when no published part fits', () => {
    expect(pickStudentPart([part(1, '2026-12-10', false)], [])).toBe(1)
  })

  it('finds nothing when every part falls in an absence', () => {
    const away = [{ startDate: day('2026-11-01'), endDate: day('2026-12-31') }]
    expect(pickStudentPart([part(1, '2026-11-26')], away)).toBeNull()
  })
})
