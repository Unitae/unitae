import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError } from '~/shared/errors/app-error.server'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { territory: { findFirst: vi.fn() } } }))

const { assertTerritoryNumberFree } = await import('./territory-number.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('assertTerritoryNumberFree', () => {
  it('passes when no other territory has the number', async () => {
    vi.mocked(db.territory.findFirst).mockResolvedValue(null)

    await expect(assertTerritoryNumberFree(db as never, 1, 'T15')).resolves.toBeUndefined()
  })

  it('refuses a number another territory has', async () => {
    vi.mocked(db.territory.findFirst).mockResolvedValue({ id: 7 } as never)

    await expect(assertTerritoryNumberFree(db as never, 1, 't13')).rejects.toThrow(
      new ConflictError('territory_number_taken'),
    )
  })
})
