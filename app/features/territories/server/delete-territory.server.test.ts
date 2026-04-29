import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({ audit: vi.fn(), AuditAction: {} }))

vi.mock('~/shared/infra/db.server', () => ({
  db: { territory: { delete: vi.fn() } },
  unscopedDb: { auditLog: { create: vi.fn().mockResolvedValue({}) } },
}))

const { deleteTerritory } = await import('./delete-territory.server')
const { db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('deleteTerritory', () => {
  it('returns the deleted territory', async () => {
    const fake = { id: 5, number: 'D001', congregationId: 1 }
    vi.mocked(db.territory.delete).mockResolvedValue(fake as never)

    const result = await deleteTerritory(db as any, 5, 1, 1)

    expect(result).toEqual(fake)
  })

  it('passes the compound key to the delete call', async () => {
    vi.mocked(db.territory.delete).mockResolvedValue({} as never)

    await deleteTerritory(db as any, 42, 7, 1)

    expect(db.territory.delete).toHaveBeenCalledWith({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: 42, congregationId: 7 },
      },
    })
  })
})
