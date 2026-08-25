import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { attributionsOverlap } from './attribution.aggregate'

// Attribution overlap covers the 5 cases the state model exposes:
// active vs active (both endDate null), active vs closed, closed vs closed
// non-overlapping, adjacent-day, and mid-window intersection.

const d = (iso: string) => new Date(iso)

describe('attributionsOverlap', () => {
  it('detects two overlapping closed intervals', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-06-01') },
        { startDate: d('2026-04-01'), endDate: d('2026-09-01') },
      ),
    ).toBe(true)
  })

  it('returns false when closed intervals are disjoint', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-03-01') },
        { startDate: d('2026-06-01'), endDate: d('2026-09-01') },
      ),
    ).toBe(false)
  })

  it('treats intervals that share exactly one day as overlapping', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-06-01') },
        { startDate: d('2026-06-01'), endDate: d('2026-09-01') },
      ),
    ).toBe(true)
  })

  it('returns false when closed intervals are adjacent (b starts one day after a ends)', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-05-31') },
        { startDate: d('2026-06-01'), endDate: d('2026-09-01') },
      ),
    ).toBe(false)
  })

  it('treats an open-ended candidate as overlapping any interval that ends on or after its start', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-01-01'), endDate: null },
        { startDate: d('2020-06-01'), endDate: d('2026-05-01') },
      ),
    ).toBe(true)
  })

  it('returns false when an open-ended candidate starts after the other interval ended', () => {
    expect(
      attributionsOverlap(
        { startDate: d('2026-06-01'), endDate: null },
        { startDate: d('2020-01-01'), endDate: d('2026-05-01') },
      ),
    ).toBe(false)
  })

  it('treats two open-ended intervals as always overlapping', () => {
    expect(
      attributionsOverlap({ startDate: d('2020-01-01'), endDate: null }, { startDate: d('2026-06-01'), endDate: null }),
    ).toBe(true)
  })

  it('is symmetric — argument order does not matter', () => {
    const a = { startDate: d('2026-01-01'), endDate: d('2026-06-01') }
    const b = { startDate: d('2026-04-01'), endDate: d('2026-09-01') }
    expect(attributionsOverlap(a, b)).toBe(attributionsOverlap(b, a))
  })
})

// ——— mocked-db aggregate behavior (campaign layer) ———

vi.mock('~/shared/domain/settings.server', () => ({ getSetting: vi.fn() }))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('./campaign.queries', () => ({ getActiveCampaign: vi.fn() }))

const mockDb = {
  attribution: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  territory: { findUniqueOrThrow: vi.fn() },
}

const aggregate = await import('./attribution.aggregate')
const { getActiveCampaign } = await import('./campaign.queries')
const { getSetting } = await import('~/shared/domain/settings.server')

const baseAssign = {
  publisherId: 1,
  territoryId: 2,
  startDate: '2026-03-15',
  notes: '',
  type: TerritoryAttributionKind.Default,
  congregationId: 10,
  actorId: 99,
}

const activeCampaign = { id: 5, name: 'Mémorial', endDate: new Date(2026, 3, 30), endCloseCampaign: true }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getSetting).mockResolvedValue(undefined)
  vi.mocked(getActiveCampaign).mockResolvedValue(null as never)
  mockDb.attribution.create.mockResolvedValue({ id: 42 } as never)
  mockDb.attribution.update.mockResolvedValue({ id: 42 } as never)
  mockDb.attribution.findMany.mockResolvedValue([])
  mockDb.attribution.findFirst.mockResolvedValue(null as never)
  mockDb.territory.findUniqueOrThrow.mockResolvedValue({ type: TerritoryKindKey.Classical } as never)
})

describe('assign — layer-aware overlap', () => {
  it('checks regular assignments only against the regular layer', async () => {
    await aggregate.assign(mockDb as never, baseAssign)

    const where = mockDb.attribution.findMany.mock.calls[0][0].where
    expect(where.campaignId).toBeNull()
  })

  it('checks campaign assignments only against the same campaign', async () => {
    vi.mocked(getActiveCampaign).mockResolvedValue(activeCampaign as never)

    await aggregate.assign(mockDb as never, { ...baseAssign, campaignId: 5 })

    const where = mockDb.attribution.findMany.mock.calls[0][0].where
    expect(where.campaignId).toBe(5)
  })
})

describe('assign — campaign mode guard', () => {
  it('rejects a regular assignment while a campaign is active', async () => {
    vi.mocked(getActiveCampaign).mockResolvedValue(activeCampaign as never)

    await expect(aggregate.assign(mockDb as never, baseAssign)).rejects.toThrow('campaign_mode_active')
    expect(mockDb.attribution.create).not.toHaveBeenCalled()
  })

  it('rejects a campaign assignment for a campaign that is not the active one', async () => {
    vi.mocked(getActiveCampaign).mockResolvedValue(activeCampaign as never)

    await expect(aggregate.assign(mockDb as never, { ...baseAssign, campaignId: 6 })).rejects.toThrow(
      'campaign_not_active',
    )
  })

  it('rejects a campaign assignment when no campaign is active at all', async () => {
    await expect(aggregate.assign(mockDb as never, { ...baseAssign, campaignId: 5 })).rejects.toThrow(
      'campaign_not_active',
    )
  })

  it('accepts a campaign assignment for the active campaign', async () => {
    vi.mocked(getActiveCampaign).mockResolvedValue(activeCampaign as never)

    await aggregate.assign(mockDb as never, { ...baseAssign, campaignId: 5 })
    expect(mockDb.attribution.create).toHaveBeenCalled()
    expect(mockDb.attribution.create.mock.calls[0][0].data.campaignId).toBe(5)
  })

  it('accepts a regular assignment when no campaign is active', async () => {
    await aggregate.assign(mockDb as never, baseAssign)
    expect(mockDb.attribution.create).toHaveBeenCalled()
  })
})

describe('assign — occupied territories stay out of the campaign', () => {
  it('rejects a campaign assignment when the territory has an open, unpaused attribution', async () => {
    vi.mocked(getActiveCampaign).mockResolvedValue(activeCampaign as never)
    mockDb.attribution.findFirst.mockResolvedValue({ id: 99 } as never)

    await expect(aggregate.assign(mockDb as never, { ...baseAssign, campaignId: 5 })).rejects.toThrow(
      'territory_occupied',
    )
    const where = mockDb.attribution.findFirst.mock.calls[0][0].where
    expect(where).toMatchObject({ territoryId: 2, endDate: null, pausedAt: null })
    expect(mockDb.attribution.create).not.toHaveBeenCalled()
  })

  it('allows a campaign assignment when the regular attribution is paused', async () => {
    vi.mocked(getActiveCampaign).mockResolvedValue(activeCampaign as never)
    mockDb.attribution.findFirst.mockResolvedValue(null as never)

    await aggregate.assign(mockDb as never, { ...baseAssign, campaignId: 5 })
    expect(mockDb.attribution.create).toHaveBeenCalled()
  })
})

describe('assign — campaign due date', () => {
  const localDate = new Date(2026, 2, 15)
  const plusDays = (n: number) => {
    const d = new Date(localDate)
    d.setDate(d.getDate() + n)
    return d
  }

  it('is due when the campaign closes (day after the inclusive end date) with endCloseCampaign on', async () => {
    vi.mocked(getActiveCampaign).mockResolvedValue(activeCampaign as never)

    await aggregate.assign(mockDb as never, { ...baseAssign, campaignId: 5 })
    expect(mockDb.attribution.create.mock.calls[0][0].data.lateDate).toEqual(new Date(2026, 4, 1))
  })

  it('uses the regular method duration when endCloseCampaign is off', async () => {
    vi.mocked(getActiveCampaign).mockResolvedValue({ ...activeCampaign, endCloseCampaign: false } as never)

    await aggregate.assign(mockDb as never, { ...baseAssign, campaignId: 5 })
    expect(mockDb.attribution.create.mock.calls[0][0].data.lateDate).toEqual(plusDays(120))
  })
})
