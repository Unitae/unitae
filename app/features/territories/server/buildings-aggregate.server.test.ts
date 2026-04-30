import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    buildingEntrance: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    buildingResidentialData: { aggregate: vi.fn() },
    buildingAccess: { create: vi.fn() },
    // biome-ignore lint/style/useNamingConvention: Prisma-style snake_case field name
    buildingResidentialData_unused: undefined,
  },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn(), error: vi.fn() },
}))

const { updateBuildingsInEntrance } = await import('./update-buildings-in-entrance.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const mockDb = db as typeof db & {
  buildingResidentialData: { aggregate: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.buildingEntrance.update).mockResolvedValue({} as never)
  vi.mocked(db.buildingEntrance.deleteMany).mockResolvedValue({ count: 0 } as never)
})

describe('aggregate recalculation', () => {
  it('recalcule homes/phones/liberals depuis buildingResidentialData après mise à jour', async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue({
      id: 1,
      kind: 'residential',
      access: null,
      isMailboxOpen: false,
      // biome-ignore lint/style/useNamingConvention: Prisma field name with consecutive uppercase letters
      isPMR: false,
      isOpenEarly: false,
      accesses: [],
      buildings: [{ id: 10 }],
    } as never)
    mockDb.buildingResidentialData.aggregate.mockResolvedValue({
      _sum: { homes: 12, phones: 3, liberals: 1 },
    } as never)

    await updateBuildingsInEntrance(db as never, 1, [10], 5)

    const updateCalls = vi.mocked(db.buildingEntrance.update).mock.calls
    const aggregateUpdateCall = updateCalls.find(call => call[0].data && 'homes' in call[0].data)
    expect(aggregateUpdateCall).toBeDefined()
    expect(aggregateUpdateCall![0].data).toMatchObject({ homes: 12, phones: 3, liberals: 1 })
  })

  it('met à zéro les champs si aucune donnée résidentielle', async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue({
      id: 2,
      kind: 'residential',
      access: null,
      isMailboxOpen: false,
      // biome-ignore lint/style/useNamingConvention: Prisma field name with consecutive uppercase letters
      isPMR: false,
      isOpenEarly: false,
      accesses: [],
      buildings: [{ id: 20 }],
    } as never)
    mockDb.buildingResidentialData.aggregate.mockResolvedValue({
      _sum: { homes: null, phones: null, liberals: null },
    } as never)

    await updateBuildingsInEntrance(db as never, 2, [20], 5)

    const updateCalls = vi.mocked(db.buildingEntrance.update).mock.calls
    const aggregateUpdateCall = updateCalls.find(call => call[0].data && 'homes' in call[0].data)
    expect(aggregateUpdateCall).toBeDefined()
    expect(aggregateUpdateCall![0].data).toMatchObject({ homes: null, phones: null, liberals: null })
  })

  it('phone et liberals sont indépendants de homes', async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue({
      id: 3,
      kind: 'residential',
      access: null,
      isMailboxOpen: false,
      // biome-ignore lint/style/useNamingConvention: Prisma field name with consecutive uppercase letters
      isPMR: false,
      isOpenEarly: false,
      accesses: [],
      buildings: [{ id: 30 }],
    } as never)
    mockDb.buildingResidentialData.aggregate.mockResolvedValue({
      _sum: { homes: 0, phones: 45, liberals: 7 },
    } as never)

    await updateBuildingsInEntrance(db as never, 3, [30], 5)

    const updateCalls = vi.mocked(db.buildingEntrance.update).mock.calls
    const aggregateUpdateCall = updateCalls.find(call => call[0].data && 'homes' in call[0].data)
    expect(aggregateUpdateCall![0].data).toMatchObject({ homes: 0, phones: 45, liberals: 7 })
  })
})
