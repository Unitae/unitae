import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { territory: { count: vi.fn() } },
}))

const { computeNextTerritoryNumber } = await import('./compute-next-territory-number.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('computeNextTerritoryNumber', () => {
  it('returns D-prefixed number for classical territories', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(4 as never)

    const result = await computeNextTerritoryNumber(db as never, 1, TerritoryKindKey.Classical)

    expect(result).toBe('D005')
  })

  it('returns H-prefixed number for hotel territories', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0 as never)

    const result = await computeNextTerritoryNumber(db as never, 1, TerritoryKindKey.Hotel)

    expect(result).toBe('H001')
  })

  it('returns U-prefixed number for campus territories', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(9 as never)

    const result = await computeNextTerritoryNumber(db as never, 1, TerritoryKindKey.Univ)

    expect(result).toBe('U010')
  })

  it('returns C-prefixed number for commerces territories', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(2 as never)

    const result = await computeNextTerritoryNumber(db as never, 1, TerritoryKindKey.Commerces)

    expect(result).toBe('C003')
  })

  it('returns P-prefixed number for phones territories', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(11 as never)

    const result = await computeNextTerritoryNumber(db as never, 1, TerritoryKindKey.Phone)

    expect(result).toBe('P012')
  })

  it('pads to 3 digits when zero territories exist yet', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0 as never)

    const result = await computeNextTerritoryNumber(db as never, 1, TerritoryKindKey.Classical)

    expect(result).toBe('D001')
  })

  it('does not truncate when the running count exceeds 3 digits', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(999 as never)

    const result = await computeNextTerritoryNumber(db as never, 1, TerritoryKindKey.Classical)

    expect(result).toBe('D1000')
  })

  it('scopes the count query by congregation and territory kind', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0 as never)

    await computeNextTerritoryNumber(db as never, 42, TerritoryKindKey.Commerces)

    expect(db.territory.count).toHaveBeenCalledWith({
      where: { type: TerritoryKindKey.Commerces, congregationId: 42 },
    })
  })
})
