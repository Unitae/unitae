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
