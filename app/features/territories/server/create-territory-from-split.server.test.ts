import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { territory: { count: vi.fn(), create: vi.fn() } },
}))

const { createTerritoryFromSplit } = await import('./create-territory-from-split.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createTerritoryFromSplit', () => {
  it('generates D-prefixed number for classical territory type', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(4 as never)
    vi.mocked(db.territory.create).mockResolvedValue({ id: 1, number: 'D005', type: TerritoryKind.Classical } as never)

    const result = await createTerritoryFromSplit(db as any, {
      type: TerritoryKind.Classical,
      entranceIds: [1],
      congregationId: 1,
    })

    expect(result.number).toBe('D005')
  })

  it('generates H-prefixed number for hotel territory type', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0 as never)
    vi.mocked(db.territory.create).mockResolvedValue({ id: 2, number: 'H001', type: TerritoryKind.Hotel } as never)

    const result = await createTerritoryFromSplit(db as any, {
      type: TerritoryKind.Hotel,
      entranceIds: [2],
      congregationId: 1,
    })

    expect(result.number).toBe('H001')
  })

  it('generates U-prefixed number for campus territory type', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(9 as never)
    vi.mocked(db.territory.create).mockResolvedValue({ id: 3 } as never)

    const result = await createTerritoryFromSplit(db as any, {
      type: TerritoryKind.Univ,
      entranceIds: [3],
      congregationId: 1,
    })

    expect(result.number).toBe('U010')
  })

  it('generates C-prefixed number for commerces territory type', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(2 as never)
    vi.mocked(db.territory.create).mockResolvedValue({ id: 4 } as never)

    const result = await createTerritoryFromSplit(db as any, {
      type: TerritoryKind.Commerces,
      entranceIds: [4],
      congregationId: 1,
    })

    expect(result.number).toBe('C003')
  })

  it('generates P-prefixed number for phones territory type', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(11 as never)
    vi.mocked(db.territory.create).mockResolvedValue({ id: 5 } as never)

    const result = await createTerritoryFromSplit(db as any, {
      type: TerritoryKind.Phone,
      entranceIds: [5],
      congregationId: 1,
    })

    expect(result.number).toBe('P012')
  })

  it('pads number to 3 digits', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0 as never)
    vi.mocked(db.territory.create).mockResolvedValue({ id: 6 } as never)

    const result = await createTerritoryFromSplit(db as any, {
      type: TerritoryKind.Classical,
      entranceIds: [6],
      congregationId: 1,
    })

    expect(result.number).toBe('D001')
  })

  it('passes entrance ids as connect array to create', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0 as never)
    vi.mocked(db.territory.create).mockResolvedValue({ id: 7 } as never)

    await createTerritoryFromSplit(db as any, {
      type: TerritoryKind.Classical,
      entranceIds: [10, 20, 30],
      congregationId: 5,
    })

    expect(db.territory.create).toHaveBeenCalledWith({
      data: {
        number: 'D001',
        type: TerritoryKind.Classical,
        entrances: {
          connect: [{ id: 10 }, { id: 20 }, { id: 30 }],
        },
        congregationId: 5,
      },
    })
  })
})
