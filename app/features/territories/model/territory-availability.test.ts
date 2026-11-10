import { describe, expect, it } from 'vitest'

import { territoryAvailability } from './territory-availability'

// Whether a territory can be attributed today, from its latest attribution: free, resting after its last
// attribution (until the day it is free again), paused for a campaign, or held.

const today = '2026-11-09'
const last = (over: Partial<Parameters<typeof territoryAvailability>[0]['last'] & object> = {}) => ({
  type: 'Default' as const,
  campaignId: null,
  campaignRestDays: null,
  endDay: '2026-03-03',
  paused: false,
  ...over,
})

describe('territoryAvailability', () => {
  it('is free when it was never attributed', () => {
    expect(territoryAvailability({ last: null, today, campaignMode: false })).toEqual({ kind: 'free' })
  })

  it('is held while its attribution is open, paused for a campaign when a campaign froze it', () => {
    expect(territoryAvailability({ last: last({ endDay: null }), today, campaignMode: false })).toEqual({
      kind: 'held',
    })
    expect(territoryAvailability({ last: last({ endDay: null, paused: true }), today, campaignMode: true })).toEqual({
      kind: 'paused',
    })
  })

  it('rests 90 days after door-to-door work, 15 after phone work, and is free on the day the rest ends', () => {
    const doorToDoor = last({ endDay: '2026-09-28' })
    expect(territoryAvailability({ last: doorToDoor, today, campaignMode: false })).toEqual({
      kind: 'resting',
      freeDay: '2026-12-27',
    })
    expect(territoryAvailability({ last: doorToDoor, today: '2026-12-27', campaignMode: false })).toEqual({
      kind: 'free',
    })
    expect(
      territoryAvailability({ last: last({ type: 'Phone', endDay: '2026-11-02' }), today, campaignMode: false }),
    ).toEqual({
      kind: 'resting',
      freeDay: '2026-11-17',
    })
  })

  it('ignores the regular rest during a campaign, but keeps the rest of recent campaign work', () => {
    expect(territoryAvailability({ last: last({ endDay: '2026-10-20' }), today, campaignMode: true })).toEqual({
      kind: 'free',
    })
    const campaignWork = last({ campaignId: 4, campaignRestDays: 30, endDay: '2026-10-20' })
    expect(territoryAvailability({ last: campaignWork, today, campaignMode: true })).toEqual({
      kind: 'resting',
      freeDay: '2026-11-19',
    })
  })

  it('rests campaign work 15 days when the campaign sets no rest of its own', () => {
    const campaignWork = last({ campaignId: 4, endDay: '2026-11-01' })
    expect(territoryAvailability({ last: campaignWork, today, campaignMode: false })).toEqual({
      kind: 'resting',
      freeDay: '2026-11-16',
    })
  })
})
