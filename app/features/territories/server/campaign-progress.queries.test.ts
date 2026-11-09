import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  campaignTerritory: { findMany: vi.fn() },
  attribution: { findMany: vi.fn(), count: vi.fn() },
  territory: { findMany: vi.fn(), count: vi.fn() },
}

const { countCampaignReferences, getCampaignProgress, listCampaignCoverage } = await import(
  './campaign-progress.queries'
)

beforeEach(() => vi.resetAllMocks())

describe('listCampaignCoverage', () => {
  // Coverage: the territories of its scope attributed at least once for the campaign, over the scope — every territory
  // of the congregation when it names none.
  it('counts per campaign the territories of its scope it has attributed, once each', async () => {
    mockDb.campaignTerritory.findMany.mockResolvedValue([
      { campaignId: 1, territoryId: 3 },
      { campaignId: 1, territoryId: 5 },
      { campaignId: 1, territoryId: 8 },
    ])
    mockDb.attribution.findMany.mockResolvedValue([
      { campaignId: 1, territoryId: 3 },
      { campaignId: 1, territoryId: 3 },
      // Out of its scope: not counted.
      { campaignId: 1, territoryId: 9 },
      { campaignId: 2, territoryId: 4 },
      { campaignId: 2, territoryId: 6 },
    ])
    mockDb.territory.count.mockResolvedValue(40)

    expect(await listCampaignCoverage(mockDb as never, 10, [1, 2])).toEqual({
      1: { worked: 1, total: 3 },
      2: { worked: 2, total: 40 },
    })
  })
})

describe('listCampaignCoverage — a campaign that attributed nothing', () => {
  it('covers none of its scope yet, every territory when it names none', async () => {
    mockDb.campaignTerritory.findMany.mockResolvedValue([])
    mockDb.attribution.findMany.mockResolvedValue([])
    mockDb.territory.count.mockResolvedValue(20)

    expect(await listCampaignCoverage(mockDb as never, 10, [14])).toEqual({ 14: { worked: 0, total: 20 } })
  })
})

describe('getCampaignProgress', () => {
  const attribution = (id: number, territoryId: number, number: string, endDate: Date | null) => ({
    id,
    startDate: new Date(2026, 10, 2),
    endDate,
    territory: { id: territoryId, number, type: 'classical' },
    publisher: { id: 7, firstname: 'Paul', lastname: 'Bernard' },
  })

  it('gives the scope in number order, the attributions, and the attributions the campaign keeps paused', async () => {
    mockDb.territory.findMany.mockResolvedValue([
      { id: 10, number: '10', type: 'classical' },
      { id: 2, number: '2', type: 'building' },
      { id: 1, number: '1', type: 'classical' },
    ])
    mockDb.attribution.findMany.mockResolvedValue([attribution(30, 2, '2', null)])
    mockDb.attribution.count.mockResolvedValue(12)

    const progress = await getCampaignProgress(mockDb as never, { id: 5, scope: [{ territoryId: 1 }] }, 10)

    expect(progress.territories.map(territory => territory.number)).toEqual(['1', '2', '10'])
    expect(progress.attributions).toHaveLength(1)
    expect(progress.pausedCount).toBe(12)
  })
})

describe('countCampaignReferences', () => {
  // Deleting is refused while an attribution points at the campaign, as its own or as one it paused.
  it('counts the attributions that are the campaign’s or that it paused', async () => {
    mockDb.attribution.count.mockImplementation((({ where }: { where: { OR?: unknown[] } }) =>
      Promise.resolve(
        JSON.stringify(where.OR) === JSON.stringify([{ campaignId: 5 }, { pausedByCampaignId: 5 }]) ? 3 : 0,
      )) as never)

    expect(await countCampaignReferences(mockDb as never, 5, 10)).toBe(3)
  })
})
