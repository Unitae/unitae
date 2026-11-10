import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./attributable-publishers.queries', () => ({ findAttributablePublishers: vi.fn() }))
vi.mock('./attribution-duration.queries', () => ({ resolveDurationDays: vi.fn() }))
vi.mock('./campaign.queries', () => ({ getActiveCampaign: vi.fn() }))

const mockDb = {
  attribution: { findFirst: vi.fn(), findMany: vi.fn() },
  territory: { findFirst: vi.fn() },
}

const { findAttributablePublishers } = await import('./attributable-publishers.queries')
const { resolveDurationDays } = await import('./attribution-duration.queries')
const { getActiveCampaign } = await import('./campaign.queries')
const { getAssignPanel, getAttributionPanel, listAttributablePeople } = await import('./attribution-panel.queries')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(findAttributablePublishers).mockResolvedValue([
    { id: 11, firstname: 'Pascal', lastname: 'DURAND' },
    { id: 12, firstname: 'Inès', lastname: 'FONTAINE' },
  ] as never)
  mockDb.attribution.findMany.mockResolvedValue([])
})

const today = '2026-11-09'
const territory = {
  id: 3,
  number: 'T03',
  type: 'Classical',
  entrances: [
    { homes: 60, phones: 4 },
    { homes: 38, phones: null },
  ],
}

// The side panel of the attributions: what it shows of one attribution, what it needs to attribute a territory, and
// the publishers to choose from with the territories they already hold.

describe('listAttributablePeople', () => {
  it('gives each publisher who may take the kind the territories they hold, and how many are late', async () => {
    mockDb.attribution.findMany.mockResolvedValue([
      { publisherId: 11, lateDate: new Date(2026, 7, 25), pausedAt: null },
      { publisherId: 11, lateDate: new Date(2027, 0, 9), pausedAt: null },
      // Paused: held, never late.
      { publisherId: 12, lateDate: new Date(2026, 6, 1), pausedAt: new Date(2026, 10, 2) },
    ])

    expect(await listAttributablePeople(mockDb as never, 10, { kind: 'Classical', today })).toEqual([
      { id: 11, firstname: 'Pascal', lastname: 'DURAND', held: 2, late: 1 },
      { id: 12, firstname: 'Inès', lastname: 'FONTAINE', held: 1, late: 0 },
    ])
    expect(mockDb.attribution.findMany.mock.calls[0]?.[0].where).toEqual({
      congregationId: 10,
      endDate: null,
      publisherId: { in: [11, 12] },
    })
  })
})

describe('getAttributionPanel', () => {
  const attribution = {
    id: 7,
    type: 'Default',
    startDate: new Date(2026, 3, 25),
    lateDate: new Date(2026, 7, 25),
    endDate: null,
    notes: 'Commencer par la rue de la Gare.',
    pausedAt: null,
    pausedByCampaign: null,
    campaign: null,
    territory,
    publisher: { id: 11, firstname: 'Pascal', lastname: 'DURAND', leftAt: null, anonymizedAt: null },
  }

  it('is null for an attribution of another congregation', async () => {
    mockDb.attribution.findFirst.mockResolvedValue(null)

    expect(await getAttributionPanel(mockDb as never, 10, 7, today)).toBeNull()
    expect(mockDb.attribution.findFirst.mock.calls[0]?.[0].where).toEqual({ id: 7, congregationId: 10 })
  })

  it('gives the attribution as days with its state, its territory, and who may take it over', async () => {
    mockDb.attribution.findFirst.mockResolvedValue(attribution)

    const panel = await getAttributionPanel(mockDb as never, 10, 7, today)

    expect(panel).toMatchObject({
      attribution: {
        id: 7,
        type: 'Default',
        startDay: '2026-04-25',
        lateDay: '2026-08-25',
        endDay: null,
        notes: 'Commencer par la rue de la Gare.',
        state: 'overdue',
        pausedDay: null,
        pausedBy: null,
        campaign: null,
        restDays: 90,
      },
      territory: { id: 3, number: 'T03', type: 'Classical', quantity: { homes: 98, phones: 4, entrances: 2 } },
      publisher: { id: 11, firstname: 'Pascal', lastname: 'DURAND', leftDay: null, anonymized: false },
    })
    expect(panel?.people.map(person => person.id)).toEqual([11, 12])
    // The publisher already on it stays in the list, even after the kind's roles change.
    expect(vi.mocked(findAttributablePublishers).mock.calls[0]?.[3]).toEqual({ alwaysIncludeMemberId: 11 })
  })
})

describe('getAssignPanel', () => {
  it('is null for a territory of another congregation', async () => {
    mockDb.territory.findFirst.mockResolvedValue(null)

    expect(await getAssignPanel(mockDb as never, 10, 3, today)).toBeNull()
  })

  it('gives the territory, its last attribution, and how long a new one runs by each method', async () => {
    mockDb.territory.findFirst.mockResolvedValue({
      ...territory,
      attributions: [
        {
          startDate: new Date(2025, 10, 3),
          endDate: new Date(2026, 2, 3),
          publisher: { firstname: 'Damien', lastname: 'BLANCHARD', anonymizedAt: null },
        },
      ],
    })
    vi.mocked(getActiveCampaign).mockResolvedValue(null as never)
    vi.mocked(resolveDurationDays).mockImplementation(async (_db, method) => (method === 'Phone' ? 14 : 120))

    const panel = await getAssignPanel(mockDb as never, 10, 3, today)

    expect(panel).toMatchObject({
      territory: { id: 3, number: 'T03', quantity: { homes: 98, phones: 4, entrances: 2 } },
      last: { firstname: 'Damien', lastname: 'BLANCHARD', startDay: '2025-11-03', endDay: '2026-03-03' },
      campaign: null,
      durationDays: { Default: 120, Phone: 14 },
    })
  })

  it('during a campaign, attributes into it, due back when it ends if it closes its attributions', async () => {
    mockDb.territory.findFirst.mockResolvedValue({ ...territory, attributions: [] })
    vi.mocked(getActiveCampaign).mockResolvedValue({
      id: 4,
      name: 'Novembre',
      endDate: new Date(2026, 10, 29),
      endCloseCampaign: true,
    } as never)
    vi.mocked(resolveDurationDays).mockResolvedValue(120)

    const panel = await getAssignPanel(mockDb as never, 10, 3, today)

    expect(panel).toMatchObject({
      last: null,
      campaign: { id: 4, name: 'Novembre', endDay: '2026-11-29', closes: true },
    })
  })
})
