import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, ValidationError } from '~/shared/errors/app-error.server'

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    buildingEntrance: { update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}))

const { updateTerritory } = await import('./update-territory.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.territory.findUnique).mockResolvedValue({ id: 3, type: 'Classical', number: 'D003' } as never)
  vi.mocked(db.territory.findFirst).mockResolvedValue(null)
  vi.mocked(db.buildingEntrance.findMany).mockResolvedValue([])
})

describe('updateTerritory', () => {
  it('returns the updated territory', async () => {
    const fake = { id: 3, number: 'D003', notes: 'some notes', congregationId: 1 }
    vi.mocked(db.territory.update).mockResolvedValue(fake as never)

    const result = await updateTerritory(db as never, 3, 1, 99, { entranceIds: [1, 2], notes: 'some notes' })

    expect(result).toEqual(fake)
  })

  it('refuses a territory of another congregation or that does not exist', async () => {
    vi.mocked(db.territory.findUnique).mockResolvedValue(null)

    await expect(updateTerritory(db as never, 3, 1, 99, { entranceIds: [], notes: '' })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('refuses a new number another territory has', async () => {
    vi.mocked(db.territory.findFirst).mockResolvedValue({ id: 8 } as never)

    await expect(updateTerritory(db as never, 3, 1, 99, { number: 'T13', entranceIds: [], notes: '' })).rejects.toThrow(
      new ConflictError('territory_number_taken'),
    )
  })

  it('does not look the number up when it does not change', async () => {
    vi.mocked(db.territory.update).mockResolvedValue({} as never)

    await updateTerritory(db as never, 3, 1, 99, { number: ' D003 ', entranceIds: [], notes: '' })

    expect(db.territory.findFirst).not.toHaveBeenCalled()
  })
})
