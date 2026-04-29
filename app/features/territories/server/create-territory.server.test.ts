import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({ audit: vi.fn(), AuditAction: {} }))

vi.mock('~/shared/infra/db.server', () => ({
  db: { territory: { create: vi.fn() } },
  unscopedDb: { auditLog: { create: vi.fn().mockResolvedValue({}) } },
}))

const { createTerritory } = await import('./create-territory.server')
const { db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createTerritory', () => {
  it('returns the created territory', async () => {
    const fake = { id: 1, number: 'D001', type: 'doors-to-doors', congregationId: 1 }
    vi.mocked(db.territory.create).mockResolvedValue(fake as never)

    const result = await createTerritory(db as any, {
      number: 'D001',
      type: 'doors-to-doors',
      entranceIds: [10, 20],
      congregationId: 1,
    }, 1)

    expect(result).toEqual(fake)
  })

  it('passes entrance ids as connect array', async () => {
    vi.mocked(db.territory.create).mockResolvedValue({} as never)

    await createTerritory(db as any, {
      number: 'H002',
      type: 'hotel',
      entranceIds: [3, 5, 7],
      congregationId: 2,
    }, 1)

    expect(db.territory.create).toHaveBeenCalledWith({
      data: {
        number: 'H002',
        type: 'hotel',
        entrances: {
          connect: [{ id: 3 }, { id: 5 }, { id: 7 }],
        },
        congregationId: 2,
      },
    })
  })
})
