import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { building: { delete: vi.fn() } },
}))

const { deleteBuilding } = await import('./delete-building.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('deleteBuilding', () => {
  it('returns the deleted building', async () => {
    const fake = { id: 4, name: 'Building A', congregationId: 1 }
    vi.mocked(db.building.delete).mockResolvedValue(fake as never)

    const result = await deleteBuilding(db as never, 4, 1)

    expect(result).toEqual(fake)
  })

  it('passes the compound key to the delete call', async () => {
    vi.mocked(db.building.delete).mockResolvedValue({} as never)

    await deleteBuilding(db as never, 15, 6)

    expect(db.building.delete).toHaveBeenCalledWith({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: 15, congregationId: 6 },
      },
    })
  })
})
