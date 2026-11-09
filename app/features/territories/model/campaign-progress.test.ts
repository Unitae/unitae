import { describe, expect, it } from 'vitest'

import { campaignStepStates, scopeTiles } from './campaign-progress'

// Where a campaign stands: the steps of its timeline (start, during, end, rest) as done, under way or to come, and each
// territory of its scope as returned, out or not attributed yet.

describe('campaignStepStates', () => {
  const days = { today: '2026-11-09', endDay: '2026-11-29', restDays: 15 }

  it('has every step to come before the campaign starts', () => {
    expect(campaignStepStates('scheduled', days)).toEqual({ start: 'next', during: 'next', end: 'next', rest: 'next' })
  })

  it('is under way between its start and its end', () => {
    expect(campaignStepStates('active', days)).toEqual({ start: 'done', during: 'now', end: 'next', rest: 'next' })
  })

  it('rests its territories for the rest period after the day it ended, then is done', () => {
    expect(campaignStepStates('ended', { ...days, today: '2026-12-10' })).toEqual({
      start: 'done',
      during: 'done',
      end: 'done',
      rest: 'now',
    })
    // Returned on the 30th, the territories rest until the 14th inclusive.
    expect(campaignStepStates('ended', { ...days, today: '2026-12-14' }).rest).toBe('now')
    expect(campaignStepStates('ended', { ...days, today: '2026-12-15' }).rest).toBe('done')
  })
})

describe('scopeTiles', () => {
  const territories = [
    { id: 1, number: '1' },
    { id: 2, number: '2' },
    { id: 3, number: '3' },
  ]

  it('marks each territory out, returned or not attributed yet, an open attribution winning', () => {
    const attributions = [
      { territory: { id: 1 }, endDate: new Date(2026, 10, 5) },
      { territory: { id: 2 }, endDate: new Date(2026, 10, 5) },
      { territory: { id: 2 }, endDate: null },
    ]

    expect(scopeTiles(territories, attributions)).toEqual([
      { id: 1, number: '1', state: 'back' },
      { id: 2, number: '2', state: 'out' },
      { id: 3, number: '3', state: 'todo' },
    ])
  })
})
