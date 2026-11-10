import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { ValidationError } from '~/shared/errors/app-error.server'

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { update: vi.fn(), findUnique: vi.fn() },
    buildingEntrance: { update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}))

const { EntranceTakenError, setTerritoryEntrances } = await import('./territory-entrances.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const target = { id: 4, type: TerritoryKindKey.Classical }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.buildingEntrance.findMany).mockResolvedValue([])
})

describe('setTerritoryEntrances', () => {
  it('names each entrance already on another territory of the type, with its address and that territory', async () => {
    vi.mocked(db.buildingEntrance.findMany).mockResolvedValue([
      {
        id: 12,
        buildings: [
          { number: '3', street: 'Rue des Lilas' },
          { number: '5', street: 'Rue des Lilas' },
        ],
        territories: [{ number: 'T09' }],
      },
    ] as never)

    const attempt = setTerritoryEntrances(db as never, target, { entranceIds: [12] }, 1, 99)

    await expect(attempt).rejects.toBeInstanceOf(EntranceTakenError)
    await expect(attempt).rejects.toMatchObject({
      entrances: [{ id: 12, address: '3, 5 Rue des Lilas', territoryNumber: 'T09' }],
    })
  })

  it('refuses to take an entrance from the territory itself', async () => {
    await expect(
      setTerritoryEntrances(
        db as never,
        target,
        { entranceIds: [1], reassignments: [{ entranceId: 1, fromTerritoryId: 4 }] },
        1,
        99,
      ),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('saves an empty territory without looking for taken entrances', async () => {
    await expect(setTerritoryEntrances(db as never, target, { entranceIds: [] }, 1, 99)).resolves.toBeUndefined()
    expect(db.buildingEntrance.findMany).not.toHaveBeenCalled()
  })
})
