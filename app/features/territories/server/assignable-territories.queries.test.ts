import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = { territory: { findMany: vi.fn() } }

const { listAssignableTerritories } = await import('./assignable-territories.queries')

beforeEach(() => vi.resetAllMocks())

// « Attribuer un territoire » lists the territories nobody holds, each with its latest attribution and whether it can
// go out today: free, resting until a day, or paused for a campaign.

const territory = (over: Record<string, unknown> = {}) => ({
  id: 7,
  number: 'T07',
  type: 'Classical',
  entrances: [
    { homes: 80, phones: 2, kind: 'Residential', isPMR: true },
    { homes: 46, phones: null, kind: 'Residential', isPMR: true },
  ],
  attributions: [
    {
      type: 'Default',
      campaignId: null,
      startDate: new Date(2025, 10, 3),
      endDate: new Date(2026, 2, 3),
      pausedAt: null,
      campaign: null,
      publisher: { firstname: 'Damien', lastname: 'BLANCHARD', anonymizedAt: null },
    },
  ],
  ...over,
})

describe('listAssignableTerritories', () => {
  it('leaves out the territories held — during a campaign, only those actively worked', async () => {
    mockDb.territory.findMany.mockResolvedValue([])

    await listAssignableTerritories(mockDb as never, 10, { where: {}, today: '2026-11-10', campaignMode: false })
    await listAssignableTerritories(mockDb as never, 10, { where: {}, today: '2026-11-10', campaignMode: true })

    expect(mockDb.territory.findMany.mock.calls[0]?.[0].where).toEqual({
      congregationId: 10,
      attributions: { none: { endDate: null } },
    })
    expect(mockDb.territory.findMany.mock.calls[1]?.[0].where).toEqual({
      congregationId: 10,
      attributions: { none: { endDate: null, pausedAt: null } },
    })
  })

  it('gives each territory its content, its PMR access, its latest attribution and its availability', async () => {
    mockDb.territory.findMany.mockResolvedValue([territory()])

    const [row] = await listAssignableTerritories(mockDb as never, 10, {
      where: {},
      today: '2026-11-10',
      campaignMode: false,
    })

    expect(row).toEqual({
      id: 7,
      number: 'T07',
      type: 'Classical',
      quantity: { homes: 126, phones: 2, entrances: 2 },
      pmr: 'full',
      last: { firstname: 'Damien', lastname: 'BLANCHARD', startDay: '2025-11-03', endDay: '2026-03-03' },
      availability: { kind: 'free' },
      distance: null,
    })
  })

  it('says until when a territory rests, and that a never attributed one is free', async () => {
    mockDb.territory.findMany.mockResolvedValue([
      territory({
        attributions: [
          {
            type: 'Default',
            campaignId: null,
            startDate: new Date(2026, 5, 28),
            endDate: new Date(2026, 8, 28),
            pausedAt: null,
            campaign: null,
            publisher: { firstname: 'Camille', lastname: 'ROUX', anonymizedAt: null },
          },
        ],
      }),
      territory({ id: 15, number: 'T15', attributions: [] }),
    ])

    const [resting, fresh] = await listAssignableTerritories(mockDb as never, 10, {
      where: {},
      today: '2026-11-10',
      campaignMode: false,
    })

    expect(resting?.availability).toEqual({ kind: 'resting', freeDay: '2026-12-27' })
    expect(fresh).toMatchObject({ last: null, availability: { kind: 'free' } })
  })

  it('never names an anonymised publisher', async () => {
    mockDb.territory.findMany.mockResolvedValue([
      territory({
        attributions: [
          {
            type: 'Default',
            campaignId: null,
            startDate: new Date(2025, 10, 3),
            endDate: new Date(2026, 2, 3),
            pausedAt: null,
            campaign: null,
            publisher: { firstname: 'X', lastname: 'Y', anonymizedAt: new Date(2026, 5, 1) },
          },
        ],
      }),
    ])

    const [row] = await listAssignableTerritories(mockDb as never, 10, {
      where: {},
      today: '2026-11-10',
      campaignMode: false,
    })

    expect(row?.last).toMatchObject({ firstname: null, lastname: null })
  })
})
