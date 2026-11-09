import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = { territory: { findMany: vi.fn() } }

const { listTerritoryRows } = await import('./territory-list.queries')

beforeEach(() => vi.resetAllMocks())

// The territories list: each territory with what there is to visit, who holds it and when it comes back, or whether
// it can go out today, and the day it last went out. Only what a row shows travels to the page.

const today = '2026-11-10'
const attribution = (over: Record<string, unknown> = {}) => ({
  id: 70,
  type: 'Default',
  campaignId: null,
  startDate: new Date(2026, 4, 12),
  endDate: null,
  lateDate: new Date(2026, 8, 13),
  pausedAt: null,
  campaign: null,
  pausedByCampaign: null,
  publisher: { id: 11, firstname: 'Valérie', lastname: 'RICHARD', leftAt: null, anonymizedAt: null },
  ...over,
})
const territory = (over: Record<string, unknown> = {}) => ({
  id: 1,
  number: 'T01',
  type: 'Classical',
  entrances: [
    { homes: 100, phones: 4, kind: 'Residential', isPMR: false, latitude: null, longitude: null, buildings: [] },
    { homes: 50, phones: null, kind: 'Residential', isPMR: true, latitude: null, longitude: null, buildings: [] },
  ],
  attributions: [attribution()],
  _count: { attributions: 4 },
  ...over,
})

describe('listTerritoryRows', () => {
  it('lists the territories of the congregation with the filters asked, open attributions first', async () => {
    mockDb.territory.findMany.mockResolvedValue([])

    await listTerritoryRows(mockDb as never, 10, { where: { type: 'Phone' }, today, campaignMode: false })

    const query = mockDb.territory.findMany.mock.calls[0]?.[0]
    expect(query.where).toEqual({ type: 'Phone', congregationId: 10 })
    expect(query.select.attributions.orderBy).toEqual([
      { endDate: { sort: 'desc', nulls: 'first' } },
      { startDate: 'desc' },
    ])
  })

  it('gives a held territory its holder and state, its content, PMR access and last day out', async () => {
    mockDb.territory.findMany.mockResolvedValue([territory()])

    const [row] = await listTerritoryRows(mockDb as never, 10, { where: {}, today, campaignMode: false })

    expect(row).toEqual({
      id: 1,
      number: 'T01',
      type: 'Classical',
      quantity: { homes: 150, phones: 4, entrances: 2 },
      pmr: 'partial',
      hasHistory: true,
      holder: {
        attributionId: 70,
        state: 'overdue',
        lateDay: '2026-09-13',
        publisher: { id: 11, firstname: 'Valérie', lastname: 'RICHARD', leftDay: null, anonymized: false },
        campaign: null,
        pausedBy: null,
      },
      availability: { kind: 'held' },
      lastDay: '2026-05-12',
      distance: null,
    })
  })

  it('shows the attribution actively worked rather than the one a campaign paused', async () => {
    mockDb.territory.findMany.mockResolvedValue([
      territory({
        attributions: [
          attribution({ id: 71, pausedAt: new Date(2026, 10, 2), pausedByCampaign: { name: 'Novembre' } }),
          attribution({
            id: 72,
            startDate: new Date(2026, 10, 3),
            lateDate: new Date(2026, 10, 30),
            campaignId: 4,
            campaign: { id: 4, name: 'Novembre', endDate: new Date(2026, 10, 29) },
            publisher: { id: 12, firstname: 'Inès', lastname: 'FONTAINE', leftAt: null, anonymizedAt: null },
          }),
        ],
      }),
    ])

    const [row] = await listTerritoryRows(mockDb as never, 10, { where: {}, today, campaignMode: true })

    expect(row?.holder).toMatchObject({ attributionId: 72, state: 'on-time', campaign: { name: 'Novembre' } })
    expect(row?.lastDay).toBe('2026-11-03')
  })

  it('gives a free territory its availability from its last attribution, and a never attributed one none', async () => {
    mockDb.territory.findMany.mockResolvedValue([
      territory({
        attributions: [attribution({ startDate: new Date(2026, 5, 28), endDate: new Date(2026, 8, 28) })],
      }),
      territory({ id: 15, number: 'T15', attributions: [], _count: { attributions: 0 } }),
    ])

    const [resting, fresh] = await listTerritoryRows(mockDb as never, 10, { where: {}, today, campaignMode: false })

    expect(resting).toMatchObject({ holder: null, availability: { kind: 'resting', freeDay: '2026-12-27' } })
    expect(fresh).toMatchObject({ holder: null, availability: { kind: 'free' }, lastDay: null, hasHistory: false })
  })
})
