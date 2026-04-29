import { beforeEach, describe, expect, it, vi } from 'vitest'

// biome-ignore lint/style/useNamingConvention: AuditAction mock matches exported name
vi.mock('~/shared/domain/audit.server', () => ({ audit: vi.fn(), AuditAction: {} }))

vi.mock('~/shared/infra/db.server', () => ({
  db: { building: { update: vi.fn() } },
  unscopedDb: { auditLog: { create: vi.fn().mockResolvedValue({}) } },
}))

const { toggleBuildingActive } = await import('./toggle-building-active.server')
const { db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('toggleBuildingActive', () => {
  it('sets active to true', async () => {
    const fake = { id: 1, active: true, congregationId: 1 }
    vi.mocked(db.building.update).mockResolvedValue(fake as never)

    const result = await toggleBuildingActive(db as any, 1, 1, true, 1)

    expect(result).toEqual(fake)
    expect(db.building.update).toHaveBeenCalledWith({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: 1, congregationId: 1 },
      },
      data: { active: true },
    })
  })

  it('sets active to false', async () => {
    const fake = { id: 2, active: false, congregationId: 3 }
    vi.mocked(db.building.update).mockResolvedValue(fake as never)

    const result = await toggleBuildingActive(db as any, 2, 3, false, 1)

    expect(result).toEqual(fake)
    expect(db.building.update).toHaveBeenCalledWith({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: 2, congregationId: 3 },
      },
      data: { active: false },
    })
  })
})
