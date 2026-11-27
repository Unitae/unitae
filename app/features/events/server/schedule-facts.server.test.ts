import { describe, expect, it } from 'vitest'
import { answersForEvery, fills, fillsSome } from './schedule-facts.server'

// The rules the schedule rights apply to what they read: every one of a set the caller's (never true of none), a kind
// filled when every schedule of it is theirs, some schedule of it when one is (a meeting may hold several duties).

const facts = {
  schedules: [
    { id: 1, kind: 'programme' as const, role: 5 },
    { id: 2, kind: 'duty' as const, role: 6 },
    { id: 3, kind: 'duty' as const, role: 7 },
  ],
  suggested: [],
}
const event = { templateId: 4 }

describe('answersForEvery', () => {
  it('is never true of none, and true only when every role is held', () => {
    expect(answersForEvery([], [5])).toBe(false)
    expect(answersForEvery(facts.schedules.slice(1), [6])).toBe(false)
    expect(answersForEvery(facts.schedules.slice(1), [6, 7])).toBe(true)
  })
})

describe('fills and fillsSome', () => {
  it('ask every duties schedule’s responsible for the kind, any one of them for some', () => {
    expect([fills(event, facts, 'service', [6]), fillsSome(event, facts, 'service', [6])]).toEqual([false, true])
    expect([fills(event, facts, 'service', [6, 7]), fillsSome(event, facts, 'service', [8])]).toEqual([true, false])
    expect(fills(event, facts, 'service', [6], 3)).toBe(false)
    expect(fills(event, facts, 'service', [7], 3)).toBe(true)
  })

  it('fall back to the kind’s first suggested template while the event holds none of the kind', () => {
    const none = { schedules: [], suggested: [{ kind: 'duty' as const, role: 9 }] }
    expect([fills(event, none, 'service', [9]), fillsSome(event, none, 'service', [9])]).toEqual([true, true])
    expect(fillsSome({ templateId: null }, none, 'service', [9])).toBe(false)
  })
})
