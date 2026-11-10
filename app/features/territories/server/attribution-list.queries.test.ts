import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = { attribution: { findMany: vi.fn() } }

const { listOpenAttributions } = await import('./attribution-list.queries')

beforeEach(() => vi.resetAllMocks())

// The managers' list of open attributions: only what a row shows travels to the page, the days as `YYYY-MM-DD`, and
// each row's state worked out on the server, so the page never reads the clock while it renders.

const row = (over: Record<string, unknown> = {}) => ({
  id: 7,
  type: 'Default',
  startDate: new Date(2026, 3, 25),
  lateDate: new Date(2026, 7, 25),
  pausedAt: null,
  campaign: null,
  pausedByCampaign: null,
  territory: { id: 3, number: 'T03', type: 'Classical' },
  publisher: { id: 11, firstname: 'Pascal', lastname: 'DURAND', leftAt: null, anonymizedAt: null },
  ...over,
})

describe('listOpenAttributions', () => {
  it('lists the open attributions of the congregation with the filters asked', async () => {
    mockDb.attribution.findMany.mockResolvedValue([])

    await listOpenAttributions(mockDb as never, 10, { where: { type: 'Phone' }, today: '2026-11-09' })

    expect(mockDb.attribution.findMany.mock.calls[0]?.[0].where).toEqual({
      type: 'Phone',
      congregationId: 10,
      endDate: null,
    })
  })

  it('gives each row its days and its state on the day asked', async () => {
    mockDb.attribution.findMany.mockResolvedValue([row()])

    const [result] = await listOpenAttributions(mockDb as never, 10, { where: {}, today: '2026-11-09' })

    expect(result).toMatchObject({
      id: 7,
      type: 'Default',
      startDay: '2026-04-25',
      lateDay: '2026-08-25',
      state: 'overdue',
      territory: { id: 3, number: 'T03', type: 'Classical' },
      publisher: { id: 11, firstname: 'Pascal', lastname: 'DURAND', leftDay: null, anonymized: false },
      campaign: null,
      pausedBy: null,
      restDays: 90,
      distance: null,
    })
  })

  it('says which campaign holds a paused attribution, and when a campaign attribution is due back', async () => {
    mockDb.attribution.findMany.mockResolvedValue([
      row({ pausedAt: new Date(2026, 10, 2), pausedByCampaign: { name: 'Novembre' } }),
      row({ id: 8, campaign: { id: 4, name: 'Novembre', endDate: new Date(2026, 10, 29) } }),
    ])

    const [paused, campaign] = await listOpenAttributions(mockDb as never, 10, { where: {}, today: '2026-11-09' })

    expect(paused).toMatchObject({ state: 'paused', pausedBy: { name: 'Novembre' } })
    expect(campaign?.campaign).toEqual({ id: 4, name: 'Novembre', endDay: '2026-11-29' })
  })

  it('has no holder once the publisher left — and an anonymised one never shows a name', async () => {
    mockDb.attribution.findMany.mockResolvedValue([
      row({
        publisher: {
          id: 11,
          firstname: 'Céline',
          lastname: 'MOREL',
          leftAt: new Date(2026, 9, 14),
          anonymizedAt: null,
        },
      }),
      row({
        id: 9,
        publisher: { id: 12, firstname: 'X', lastname: 'Y', leftAt: null, anonymizedAt: new Date(2026, 9, 1) },
      }),
    ])

    const [left, anonymized] = await listOpenAttributions(mockDb as never, 10, { where: {}, today: '2026-11-09' })

    expect(left).toMatchObject({ state: 'orphaned', publisher: { leftDay: '2026-10-14', anonymized: false } })
    expect(anonymized).toMatchObject({
      state: 'orphaned',
      publisher: { firstname: null, lastname: null, anonymized: true },
    })
  })

  it('measures how far each territory lies from a searched place, null when none of it is placed', async () => {
    mockDb.attribution.findMany.mockResolvedValue([
      row({
        territory: {
          id: 3,
          number: 'T03',
          type: 'Classical',
          entrances: [{ latitude: 45.7601, longitude: 4.8357, buildings: [] }],
        },
      }),
      row({ id: 8, territory: { id: 4, number: 'T04', type: 'Classical', entrances: [] } }),
    ])

    const [near, unplaced] = await listOpenAttributions(mockDb as never, 10, {
      where: {},
      today: '2026-11-09',
      origin: { lat: 45.76, lng: 4.8357 },
    })

    expect(near?.distance).toBeGreaterThan(0)
    expect(near?.distance).toBeLessThan(50)
    expect(unplaced?.distance).toBeNull()
  })
})
