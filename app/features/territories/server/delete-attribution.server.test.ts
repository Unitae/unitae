import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { attribution: { delete: vi.fn() } },
}))

const { deleteAttribution } = await import('./delete-attribution.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('deleteAttribution', () => {
  it('returns the deleted attribution with publisher included', async () => {
    const fake = { id: 1, publisher: { id: 10, name: 'John' }, congregationId: 1 }
    vi.mocked(db.attribution.delete).mockResolvedValue(fake as never)

    const result = await deleteAttribution(db as never, 1, 1, 99)

    expect(result).toEqual(fake)
  })

  it('passes compound key and includes publisher', async () => {
    vi.mocked(db.attribution.delete).mockResolvedValue({} as never)

    await deleteAttribution(db as never, 8, 3, 99)

    expect(db.attribution.delete).toHaveBeenCalledWith({
      where: {
        id_congregationId: { id: 8, congregationId: 3 },
      },
      include: { publisher: true },
    })
  })
})
