import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { territory: { create: vi.fn() }, auditLog: { create: vi.fn() } },
}))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))

const { createTerritory } = await import('./create-territory.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createTerritory', () => {
  it('returns the created territory', async () => {
    const fake = { id: 1, number: 'D001', type: TerritoryKind.Classical, congregationId: 1 }
    vi.mocked(db.territory.create).mockResolvedValue(fake as never)

    const result = await createTerritory(db as any, {
      number: 'D001',
      type: TerritoryKind.Classical,
      entranceIds: [10, 20],
      congregationId: 1,
      actorId: 99,
    })

    expect(result).toEqual(fake)
  })

  it('passes entrance ids as connect array', async () => {
    vi.mocked(db.territory.create).mockResolvedValue({} as never)

    await createTerritory(db as any, {
      number: 'H002',
      type: TerritoryKind.Hotel,
      entranceIds: [3, 5, 7],
      congregationId: 2,
      actorId: 99,
    })

    expect(db.territory.create).toHaveBeenCalledWith({
      data: {
        number: 'H002',
        type: TerritoryKind.Hotel,
        entrances: {
          connect: [{ id: 3 }, { id: 5 }, { id: 7 }],
        },
        congregationId: 2,
      },
    })
  })
})
