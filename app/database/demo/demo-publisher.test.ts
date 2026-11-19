import { describe, expect, it } from 'vitest'
import { rankDemoPublishers } from './demo-publisher'

const facts = (prospection: number[], holding: number[], coming: [number, number][]) => ({
  prospection: new Set(prospection),
  holding: new Set(holding),
  coming: new Map(coming),
})

// The publisher a visitor tries the demo as: someone in the « Prospection » team, with a territory in hand and the
// most coming assignments, so every page a publisher can open has something on it.
describe('rankDemoPublishers', () => {
  it('puts a member of the prospection team first, even busier publishers outside it', () => {
    expect(
      rankDemoPublishers(
        [1, 2, 3],
        facts(
          [3],
          [1, 2, 3],
          [
            [1, 9],
            [2, 7],
          ],
        ),
      )[0],
    ).toBe(3)
  })

  it('then one with a territory in hand, then the most coming assignments', () => {
    expect(
      rankDemoPublishers(
        [1, 2, 3],
        facts(
          [1, 2, 3],
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

  it('still finds a publisher when nobody is in the prospection team', () => {
    expect(rankDemoPublishers([4, 5], facts([], [5], []))[0]).toBe(5)
  })

  it('breaks a tie the same way every time', () => {
    expect(rankDemoPublishers([7, 6], facts([], [], []))).toEqual([6, 7])
  })
})
