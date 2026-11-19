import { describe, expect, it } from 'vitest'
import { rankDemoPublishers } from './demo-publisher'

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
