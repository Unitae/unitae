import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { attribution: { findFirst: vi.fn() } } }))

const { hasHeldTerritory } = await import('./has-held-territory.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

describe('hasHeldTerritory', () => {
  it('is true once the member has had any attribution, returned or not', async () => {
    vi.mocked(db.attribution.findFirst).mockResolvedValue({ id: 4 } as never)
    expect(await hasHeldTerritory(db, 12, 1)).toBe(true)
  })

  it('is false for a member who never held a territory', async () => {
    vi.mocked(db.attribution.findFirst).mockResolvedValue(null as never)
    expect(await hasHeldTerritory(db, 12, 1)).toBe(false)
  })
})
