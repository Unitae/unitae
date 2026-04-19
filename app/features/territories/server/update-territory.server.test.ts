import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  db: { territory: { update: vi.fn() } },
}))

const { updateTerritory } = await import('./update-territory.server')
const { db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updateTerritory', () => {
  it('returns the updated territory', async () => {
    const fake = { id: 3, number: 'D003', notes: 'some notes', congregationId: 1 }
    vi.mocked(db.territory.update).mockResolvedValue(fake as never)

    const result = await updateTerritory(db as any, 3, 1, {
      entranceIds: [1, 2],
      notes: 'some notes',
    })

    expect(result).toEqual(fake)
  })

  it('passes entrance ids as set array and notes', async () => {
    vi.mocked(db.territory.update).mockResolvedValue({} as never)

    await updateTerritory(db as any, 10, 5, {
      entranceIds: [4, 8],
      notes: 'updated notes',
    })

    expect(db.territory.update).toHaveBeenCalledWith({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: 10, congregationId: 5 },
      },
      data: {
        entrances: {
          set: [{ id: 4 }, { id: 8 }],
        },
        notes: 'updated notes',
      },
    })
  })
})
