import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConflictError } from '~/shared/errors/app-error.server'

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { territory: { delete: vi.fn() }, attribution: { count: vi.fn() } },
}))

const { deleteTerritory } = await import('./delete-territory.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.attribution.count).mockResolvedValue(0 as never)
})

describe('deleteTerritory', () => {
  it('refuses a territory that was ever attributed: its history counts for the S-13', async () => {
    vi.mocked(db.attribution.count).mockResolvedValue(2 as never)

    await expect(deleteTerritory(db as never, 5, 1, 99)).rejects.toBeInstanceOf(ConflictError)
    expect(db.territory.delete).not.toHaveBeenCalled()
    expect(vi.mocked(db.attribution.count).mock.calls[0]?.[0]).toEqual({ where: { territoryId: 5, congregationId: 1 } })
  })

  it('returns the deleted territory', async () => {
    const fake = { id: 5, number: 'D001', congregationId: 1 }
    vi.mocked(db.territory.delete).mockResolvedValue(fake as never)

    const result = await deleteTerritory(db as never, 5, 1, 99)

    expect(result).toEqual(fake)
  })

  it('passes the compound key to the delete call', async () => {
    vi.mocked(db.territory.delete).mockResolvedValue({} as never)

    await deleteTerritory(db as never, 42, 7, 99)

    expect(db.territory.delete).toHaveBeenCalledWith({
      where: {
        id_congregationId: { id: 42, congregationId: 7 },
      },
    })
  })
})
