import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { ConflictError } from '~/shared/errors/app-error.server'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    buildingEntrance: { findMany: vi.fn() },
  },
}))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))

const { createTerritory } = await import('./create-territory.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.territory.findFirst).mockResolvedValue(null)
  vi.mocked(db.buildingEntrance.findMany).mockResolvedValue([])
})

describe('createTerritory', () => {
  it('returns the created territory', async () => {
    const fake = { id: 1, number: 'D001', type: TerritoryKindKey.Classical, congregationId: 1 }
    vi.mocked(db.territory.create).mockResolvedValue(fake as never)

    const result = await createTerritory(db as never, {
      number: ' D001 ',
      type: TerritoryKindKey.Classical,
      entranceIds: [10, 20],
      congregationId: 1,
      actorId: 99,
    })

    expect(result).toEqual(fake)
  })

  it('refuses a number another territory has, before creating anything', async () => {
    vi.mocked(db.territory.findFirst).mockResolvedValue({ id: 5 } as never)

    await expect(
      createTerritory(db as never, {
        number: 'T13',
        type: TerritoryKindKey.Classical,
        entranceIds: [],
        congregationId: 1,
        actorId: 99,
      }),
    ).rejects.toThrow(new ConflictError('territory_number_taken'))
    expect(db.territory.create).not.toHaveBeenCalled()
  })
})
