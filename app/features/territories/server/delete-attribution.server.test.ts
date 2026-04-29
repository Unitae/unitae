import { beforeEach, describe, expect, it, vi } from 'vitest'

// biome-ignore lint/style/useNamingConvention: AuditAction mock matches exported name
vi.mock('~/shared/domain/audit.server', () => ({ audit: vi.fn(), AuditAction: {} }))

vi.mock('~/shared/infra/db.server', () => ({
  db: { attribution: { delete: vi.fn() } },
  unscopedDb: { auditLog: { create: vi.fn().mockResolvedValue({}) } },
}))

const { deleteAttribution } = await import('./delete-attribution.server')
const { db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('deleteAttribution', () => {
  it('returns the deleted attribution with publisher included', async () => {
    const fake = { id: 1, publisher: { id: 10, name: 'John' }, congregationId: 1 }
    vi.mocked(db.attribution.delete).mockResolvedValue(fake as never)

    const result = await deleteAttribution(db as any, 1, 1, 1)

    expect(result).toEqual(fake)
  })

  it('passes compound key and includes publisher', async () => {
    vi.mocked(db.attribution.delete).mockResolvedValue({} as never)

    await deleteAttribution(db as any, 8, 3, 1)

    expect(db.attribution.delete).toHaveBeenCalledWith({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound key
        id_congregationId: { id: 8, congregationId: 3 },
      },
      include: { publisher: true },
    })
  })
})
