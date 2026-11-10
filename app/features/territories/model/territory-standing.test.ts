import { describe, expect, it } from 'vitest'

import { territoryStanding } from './territory-standing'

// Where a territory stands on its page: the attribution actively worked (before one a campaign paused) with its state,
// the latest one rentré, and whether it can go out today.

const today = '2026-11-10'
const entry = (over: Record<string, unknown> = {}) => ({
  id: 1,
  type: 'Default' as const,
  startDay: '2026-07-16',
  endDay: null as string | null,
  lateDay: '2026-11-16',
  paused: false,
  campaign: null as { id: number } | null,
  restDays: 90,
  publisher: { leftDay: null as string | null, anonymized: false },
  ...over,
})

describe('territoryStanding', () => {
  it('gives the open attribution with its state, and the territory held', () => {
    const standing = territoryStanding([entry(), entry({ id: 0, startDay: '2026-01-02', endDay: '2026-05-02' })], {
      today,
      campaignMode: false,
    })
    expect(standing.current).toMatchObject({ id: 1, state: 'due-soon' })
    expect(standing.last?.id).toBe(0)
    expect(standing.availability).toEqual({ kind: 'held' })
  })

  it('prefers the attribution actively worked to one a campaign paused', () => {
    const standing = territoryStanding(
      [entry({ id: 2, startDay: '2026-11-03', campaign: { id: 4 }, lateDay: '2026-11-30' }), entry({ paused: true })],
      { today, campaignMode: true },
    )
    expect(standing.current).toMatchObject({ id: 2, state: 'on-time' })
  })

  it('without a holder, says who had it last and until when it rests', () => {
    const standing = territoryStanding([entry({ endDay: '2026-09-28' })], { today, campaignMode: false })
    expect(standing.current).toBeNull()
    expect(standing.last?.endDay).toBe('2026-09-28')
    expect(standing.availability).toEqual({ kind: 'resting', freeDay: '2026-12-27' })
  })

  it('is free when it was never attributed', () => {
    expect(territoryStanding([], { today, campaignMode: false })).toEqual({
      current: null,
      last: null,
      availability: { kind: 'free' },
    })
  })
})
