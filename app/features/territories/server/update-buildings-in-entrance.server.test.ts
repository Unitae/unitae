import { beforeEach, describe, expect, it, vi } from 'vitest'

// The joining, leaving and totals behaviour runs against a real database in
// update-buildings-in-entrance.server.integration.test.ts; these cover scoping and failures.

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    building: { findMany: vi.fn() },
    buildingResidentialData: { aggregate: vi.fn() },
    buildingEntrance: {
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { BuildingEntranceSharingChanged: 'building.entrance_sharing.changed' },
  audit: vi.fn(),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

const { updateBuildingsInEntrance } = await import('./update-buildings-in-entrance.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const unchangedEntrance = {
  id: 10,
  access: 1,
  isMailboxOpen: false,
  isPMR: false,
  isOpenEarly: false,
  notes: '',
  buildings: [{ id: 1 }],
  territories: [],
  accesses: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.building.findMany).mockResolvedValue([] as never)
  vi.mocked(db.buildingResidentialData.aggregate).mockResolvedValue({ _sum: {} } as never)
  vi.mocked(db.buildingEntrance.update).mockResolvedValue({} as never)
  vi.mocked(db.buildingEntrance.deleteMany).mockResolvedValue({ count: 0 } as never)
})

describe('updateBuildingsInEntrance', () => {
  it("ne fait rien si l'entrée n'existe pas", async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue(null as never)

    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await updateBuildingsInEntrance(db as never, 999, [1, 2], 1, 3)
    expect(result).toBeUndefined()
    expect(result).not.toBe(sentinel)
  })

  it('lit et nettoie les entrées de la seule congrégation (#281)', async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue(unchangedEntrance as never)

    await updateBuildingsInEntrance(db as never, 10, [1], 7, 3)

    expect(db.buildingEntrance.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_congregationId: { id: 10, congregationId: 7 } } }),
    )
    expect(db.buildingEntrance.deleteMany).toHaveBeenCalledWith({
      where: { congregationId: 7, buildings: { none: {} } },
    })
  })

  it('propage les erreurs pour que la transaction annule tout', async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue(unchangedEntrance as never)
    vi.mocked(db.buildingEntrance.update).mockRejectedValue(new Error('Update failed'))

    await expect(updateBuildingsInEntrance(db as never, 10, [1], 1, 3)).rejects.toThrow('Update failed')
  })
})
