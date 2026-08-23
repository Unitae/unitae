import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  campaign: { findFirst: vi.fn() },
}

const { getActiveCampaign } = await import('./campaign.queries')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getActiveCampaign', () => {
  it('returns the campaign that is activated and not ended', async () => {
    const campaign = { id: 1, name: 'Mémorial', activatedAt: new Date(), endedAt: null }
    mockDb.campaign.findFirst.mockResolvedValue(campaign as never)

    await expect(getActiveCampaign(mockDb as never, 10)).resolves.toBe(campaign)

    const where = mockDb.campaign.findFirst.mock.calls[0][0].where
    expect(where).toMatchObject({ congregationId: 10, activatedAt: { not: null }, endedAt: null })
  })

  it('returns null when no campaign is active', async () => {
    mockDb.campaign.findFirst.mockResolvedValue(null as never)
    await expect(getActiveCampaign(mockDb as never, 10)).resolves.toBeNull()
  })
})

describe('getCampaignsDueToActivate', () => {
  it('selects never-activated campaigns whose start day has arrived', async () => {
    const queriesDb = { campaign: { findMany: vi.fn().mockResolvedValue([]) } }
    const now = new Date(2026, 0, 15, 2)

    const { getCampaignsDueToActivate } = await import('./campaign.queries')
    await getCampaignsDueToActivate(queriesDb as never, 10, now)

    const where = queriesDb.campaign.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ congregationId: 10, activatedAt: null, endedAt: null, startDate: { lte: now } })
  })
})

describe('getCampaignsDueToEnd', () => {
  it('ends campaigns only once their inclusive endDate is fully past', async () => {
    const queriesDb = { campaign: { findMany: vi.fn().mockResolvedValue([]) } }
    const now = new Date(2026, 2, 2, 2, 30) // morning of March 2nd

    const { getCampaignsDueToEnd } = await import('./campaign.queries')
    await getCampaignsDueToEnd(queriesDb as never, 10, now)

    const where = queriesDb.campaign.findMany.mock.calls[0][0].where
    // endDate = March 1st (inclusive last day) → strictly before March 2nd 00:00
    expect(where).toMatchObject({
      congregationId: 10,
      activatedAt: { not: null },
      endedAt: null,
      endDate: { lt: new Date(2026, 2, 2) },
    })
  })
})

describe('listAllTerritoryIds', () => {
  it('returns the ids of every territory in the congregation', async () => {
    const queriesDb = { territory: { findMany: vi.fn().mockResolvedValue([{ id: 1 }, { id: 3 }]) } }

    const { listAllTerritoryIds } = await import('./campaign.queries')
    await expect(listAllTerritoryIds(queriesDb as never, 10)).resolves.toEqual([1, 3])

    expect(queriesDb.territory.findMany.mock.calls[0][0].where).toEqual({ congregationId: 10 })
  })
})

describe('listCampaigns', () => {
  it('lists the congregation campaigns newest window first with their scope size', async () => {
    const queriesDb = { campaign: { findMany: vi.fn().mockResolvedValue([]) } }

    const { listCampaigns } = await import('./campaign.queries')
    await listCampaigns(queriesDb as never, 10)

    const call = queriesDb.campaign.findMany.mock.calls[0][0]
    expect(call.where).toEqual({ congregationId: 10 })
    expect(call.orderBy).toEqual({ startDate: 'desc' })
    expect(call.include).toMatchObject({ _count: { select: { scope: true } } })
  })
})

describe('getCampaign', () => {
  it('fetches one campaign with its scope territory ids', async () => {
    const queriesDb = { campaign: { findFirst: vi.fn().mockResolvedValue(null) } }

    const { getCampaign } = await import('./campaign.queries')
    await getCampaign(queriesDb as never, 3, 10)

    const call = queriesDb.campaign.findFirst.mock.calls[0][0]
    expect(call.where).toEqual({ id: 3, congregationId: 10 })
    expect(call.include).toMatchObject({ scope: { select: { territoryId: true } } })
  })
})

describe('getUpcomingCampaign', () => {
  it('returns the next never-activated campaign whose window is not past', async () => {
    const queriesDb = { campaign: { findFirst: vi.fn().mockResolvedValue(null) } }
    const now = new Date(2026, 0, 10)

    const { getUpcomingCampaign } = await import('./campaign.queries')
    await getUpcomingCampaign(queriesDb as never, 10, now)

    const call = queriesDb.campaign.findFirst.mock.calls[0][0]
    expect(call.where).toMatchObject({ congregationId: 10, activatedAt: null, endedAt: null, endDate: { gte: now } })
    expect(call.orderBy).toEqual({ startDate: 'asc' })
  })
})

describe('listCampaignAttributions', () => {
  it('lists the campaign attributions with territory and publisher, territory number first', async () => {
    const queriesDb = { attribution: { findMany: vi.fn().mockResolvedValue([]) } }

    const { listCampaignAttributions } = await import('./campaign.queries')
    await listCampaignAttributions(queriesDb as never, 3, 10)

    const call = queriesDb.attribution.findMany.mock.calls[0][0]
    expect(call.where).toEqual({ campaignId: 3, congregationId: 10 })
    expect(call.select).toMatchObject({
      territory: { select: { id: true, number: true } },
      publisher: { select: { firstname: true, lastname: true } },
    })
    expect(call.orderBy).toEqual([{ territory: { number: 'asc' } }, { startDate: 'asc' }])
  })
})
