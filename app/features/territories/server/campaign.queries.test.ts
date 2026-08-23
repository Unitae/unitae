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
