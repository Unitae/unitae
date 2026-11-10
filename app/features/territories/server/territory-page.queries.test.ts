import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = { territory: { findFirst: vi.fn(), findMany: vi.fn() } }

const { findAdjacentTerritories, getTerritoryPage } = await import('./territory-page.queries')

beforeEach(() => vi.resetAllMocks())

// A territory's page: its entrances (as its holder reads them, with the building each one opens), its notes, and its
// attributions newest first, as days. Its neighbours come in the order people count: T2 before T10.

describe('getTerritoryPage', () => {
  it('is null for a territory of another congregation', async () => {
    mockDb.territory.findFirst.mockResolvedValue(null)

    expect(await getTerritoryPage(mockDb as never, 10, 3)).toBeNull()
    expect(mockDb.territory.findFirst.mock.calls[0]?.[0].where).toEqual({ id: 3, congregationId: 10 })
  })

  it('gives the territory, its entrances with their first building, and its attributions as days', async () => {
    mockDb.territory.findFirst.mockResolvedValue({
      id: 3,
      number: 'T03',
      type: 'Classical',
      notes: 'Commencer par la rue de la Gare.',
      entrances: [
        {
          id: 30,
          homes: 24,
          phones: 2,
          access: null,
          isOpenEarly: null,
          isMailboxOpen: null,
          notes: '',
          shopKind: '',
          accesses: [],
          buildings: [
            { id: 300, number: '12', street: 'Rue Voltaire', zip: '69003', latitude: 45.76, longitude: 4.83 },
          ],
        },
      ],
      attributions: [
        {
          id: 70,
          type: 'Phone',
          startDate: new Date(2026, 5, 4),
          endDate: new Date(2026, 6, 9),
          lateDate: new Date(2026, 6, 18),
          pausedAt: null,
          campaign: null,
          publisher: {
            id: 11,
            firstname: 'Léa',
            lastname: 'GARNIER',
            leftAt: null,
            anonymizedAt: null,
            publisherGroup: { name: 'Groupe Sud' },
          },
        },
      ],
    })

    const page = await getTerritoryPage(mockDb as never, 10, 3)

    expect(page).toMatchObject({
      territory: { id: 3, number: 'T03', type: 'Classical', notes: 'Commencer par la rue de la Gare.' },
      buildingOf: { 30: 300 },
      history: [
        {
          id: 70,
          type: 'Phone',
          startDay: '2026-06-04',
          endDay: '2026-07-09',
          lateDay: '2026-07-18',
          paused: false,
          campaign: null,
          restDays: 15,
          publisher: { id: 11, firstname: 'Léa', lastname: 'GARNIER', leftDay: null, anonymized: false },
          groupName: 'Groupe Sud',
        },
      ],
    })
    expect(page?.entrances[0]?.id).toBe(30)
  })
})

describe('findAdjacentTerritories', () => {
  it('finds the neighbours of a territory of the same kind in the order people count', async () => {
    mockDb.territory.findMany.mockResolvedValue([
      { id: 10, number: 'T10' },
      { id: 2, number: 'T2' },
      { id: 9, number: 'T9' },
      { id: 1, number: 'T1' },
    ])

    expect(await findAdjacentTerritories(mockDb as never, 10, { number: 'T9', type: 'Classical' }, 'fr')).toEqual({
      prev: { id: 2, number: 'T2' },
      next: { id: 10, number: 'T10' },
    })
    expect(mockDb.territory.findMany.mock.calls[0]?.[0].where).toEqual({ congregationId: 10, type: 'Classical' })
  })

  it('has no neighbour before the first, nor after the last', async () => {
    mockDb.territory.findMany.mockResolvedValue([
      { id: 1, number: 'T1' },
      { id: 2, number: 'T2' },
    ])

    expect(await findAdjacentTerritories(mockDb as never, 10, { number: 'T1', type: 'Classical' }, 'fr')).toEqual({
      prev: null,
      next: { id: 2, number: 'T2' },
    })
  })
})
