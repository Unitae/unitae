import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./attribution-pause.aggregate', () => ({
  pauseOpenRegulars: vi.fn(),
  closeOpenRegulars: vi.fn(),
  resumePausedBy: vi.fn(),
  closePausedBy: vi.fn(),
  closeOpenCampaignAttributions: vi.fn(),
}))
vi.mock('./attribution.aggregate', () => ({ assign: vi.fn() }))
vi.mock('./campaign.aggregate', () => ({
  markActivated: vi.fn(),
  markEnded: vi.fn(),
  replaceScope: vi.fn(),
}))
vi.mock('./campaign.queries', () => ({ listAllTerritoryIds: vi.fn() }))

const pauseAggregate = await import('./attribution-pause.aggregate')
const attributionAggregate = await import('./attribution.aggregate')
const campaignAggregate = await import('./campaign.aggregate')
const { listAllTerritoryIds } = await import('./campaign.queries')
const { activateCampaign, endCampaign, applyScopeChange } = await import('./campaign-lifecycle.workflow')

const db = {} as never
const now = new Date(2026, 0, 15)

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    name: 'Mémorial',
    startRegularAction: 'Pause',
    startAutoReassign: false,
    endCloseCampaign: true,
    endRegularAction: 'Resume',
    activatedAt: null,
    endedAt: null,
    scope: [] as { territoryId: number }[],
    ...overrides,
  } as never
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(pauseAggregate.pauseOpenRegulars).mockResolvedValue([])
  vi.mocked(pauseAggregate.closeOpenRegulars).mockResolvedValue(0)
  vi.mocked(pauseAggregate.resumePausedBy).mockResolvedValue(0)
  vi.mocked(pauseAggregate.closePausedBy).mockResolvedValue(0)
  vi.mocked(pauseAggregate.closeOpenCampaignAttributions).mockResolvedValue(0)
  vi.mocked(listAllTerritoryIds).mockResolvedValue([])
})

describe('activateCampaign', () => {
  it('is idempotent — an already-activated campaign is skipped entirely', async () => {
    const result = await activateCampaign(db, makeCampaign({ activatedAt: new Date() }), 10, 0, now)

    expect(result.activated).toBe(false)
    expect(campaignAggregate.markActivated).not.toHaveBeenCalled()
    expect(pauseAggregate.pauseOpenRegulars).not.toHaveBeenCalled()
  })

  it('stamps activatedAt before running the transitions (mode turns on first)', async () => {
    const order: string[] = []
    vi.mocked(campaignAggregate.markActivated).mockImplementation(async () => {
      order.push('mark')
      return {} as never
    })
    vi.mocked(pauseAggregate.pauseOpenRegulars).mockImplementation(async () => {
      order.push('pause')
      return []
    })

    await activateCampaign(db, makeCampaign(), 10, 0, now)
    expect(order).toEqual(['mark', 'pause'])
  })

  it('Pause: pauses open regulars in scope', async () => {
    await activateCampaign(db, makeCampaign({ scope: [{ territoryId: 7 }] }), 10, 0, now)

    expect(pauseAggregate.pauseOpenRegulars).toHaveBeenCalledWith(db, {
      congregationId: 10,
      campaignId: 5,
      territoryIds: [7],
      actorId: 0,
      now,
    })
    expect(pauseAggregate.closeOpenRegulars).not.toHaveBeenCalled()
  })

  it('Pause with empty scope passes territoryIds null (whole congregation)', async () => {
    await activateCampaign(db, makeCampaign(), 10, 0, now)

    expect(pauseAggregate.pauseOpenRegulars).toHaveBeenCalledWith(db, expect.objectContaining({ territoryIds: null }))
  })

  it('Pause + startAutoReassign re-creates each paused pair inside the campaign', async () => {
    vi.mocked(pauseAggregate.pauseOpenRegulars).mockResolvedValue([{ id: 1, publisherId: 2, territoryId: 3 }] as never)

    const result = await activateCampaign(db, makeCampaign({ startAutoReassign: true }), 10, 0, now)

    expect(attributionAggregate.assign).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ publisherId: 2, territoryId: 3, campaignId: 5, congregationId: 10 }),
    )
    expect(result.reassigned).toBe(1)
  })

  it('Close: returns open regulars instead of pausing', async () => {
    await activateCampaign(db, makeCampaign({ startRegularAction: 'Close' }), 10, 0, now)

    expect(pauseAggregate.closeOpenRegulars).toHaveBeenCalled()
    expect(pauseAggregate.pauseOpenRegulars).not.toHaveBeenCalled()
  })

  it('Leave: touches nothing', async () => {
    await activateCampaign(db, makeCampaign({ startRegularAction: 'Leave' }), 10, 0, now)

    expect(pauseAggregate.pauseOpenRegulars).not.toHaveBeenCalled()
    expect(pauseAggregate.closeOpenRegulars).not.toHaveBeenCalled()
  })
})

describe('endCampaign', () => {
  const active = () => makeCampaign({ activatedAt: new Date(2026, 0, 15) })

  it('is idempotent — an already-ended campaign is skipped', async () => {
    const result = await endCampaign(db, makeCampaign({ activatedAt: new Date(), endedAt: new Date() }), 10, 0, now)

    expect(result.ended).toBe(false)
    expect(campaignAggregate.markEnded).not.toHaveBeenCalled()
  })

  it('never ends a campaign that was not activated', async () => {
    const result = await endCampaign(db, makeCampaign(), 10, 0, now)
    expect(result.ended).toBe(false)
  })

  it('endCloseCampaign=true closes the campaign attributions', async () => {
    await endCampaign(db, active(), 10, 0, now)

    expect(pauseAggregate.closeOpenCampaignAttributions).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ campaignId: 5, territoryIds: null }),
    )
  })

  it('endCloseCampaign=false leaves the campaign attributions open', async () => {
    await endCampaign(db, makeCampaign({ activatedAt: new Date(), endCloseCampaign: false }), 10, 0, now)

    expect(pauseAggregate.closeOpenCampaignAttributions).not.toHaveBeenCalled()
  })

  it('Resume: lifts the pauses this campaign created', async () => {
    await endCampaign(db, active(), 10, 0, now)
    expect(pauseAggregate.resumePausedBy).toHaveBeenCalled()
    expect(pauseAggregate.closePausedBy).not.toHaveBeenCalled()
  })

  it('KeepPaused: leaves the paused regulars alone', async () => {
    await endCampaign(db, makeCampaign({ activatedAt: new Date(), endRegularAction: 'KeepPaused' }), 10, 0, now)
    expect(pauseAggregate.resumePausedBy).not.toHaveBeenCalled()
    expect(pauseAggregate.closePausedBy).not.toHaveBeenCalled()
  })

  it('Close: returns the paused regulars', async () => {
    await endCampaign(db, makeCampaign({ activatedAt: new Date(), endRegularAction: 'Close' }), 10, 0, now)
    expect(pauseAggregate.closePausedBy).toHaveBeenCalled()
  })
})

describe('applyScopeChange', () => {
  it('replaces the scope without transitions when the campaign is not active', async () => {
    await applyScopeChange(db, makeCampaign({ scope: [{ territoryId: 1 }] }), [1, 2], 10, 0, now)

    expect(campaignAggregate.replaceScope).toHaveBeenCalledWith(db, 5, 10, [1, 2])
    expect(pauseAggregate.pauseOpenRegulars).not.toHaveBeenCalled()
    expect(pauseAggregate.closeOpenCampaignAttributions).not.toHaveBeenCalled()
  })

  it('applies the start transition to added territories of an active campaign', async () => {
    const campaign = makeCampaign({ activatedAt: new Date(), scope: [{ territoryId: 1 }] })

    await applyScopeChange(db, campaign, [1, 2], 10, 0, now)

    expect(pauseAggregate.pauseOpenRegulars).toHaveBeenCalledWith(db, expect.objectContaining({ territoryIds: [2] }))
    expect(campaignAggregate.replaceScope).toHaveBeenCalledWith(db, 5, 10, [1, 2])
  })

  it('applies the end transition to removed territories of an active campaign', async () => {
    const campaign = makeCampaign({ activatedAt: new Date(), scope: [{ territoryId: 1 }, { territoryId: 2 }] })

    await applyScopeChange(db, campaign, [1], 10, 0, now)

    expect(pauseAggregate.closeOpenCampaignAttributions).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ territoryIds: [2] }),
    )
    expect(pauseAggregate.resumePausedBy).toHaveBeenCalledWith(db, expect.objectContaining({ territoryIds: [2] }))
  })

  it('treats an empty scope as all territories when narrowing an active campaign', async () => {
    vi.mocked(listAllTerritoryIds).mockResolvedValue([1, 2, 3])
    const campaign = makeCampaign({ activatedAt: new Date(), scope: [] })

    await applyScopeChange(db, campaign, [1], 10, 0, now)

    // territories 2 and 3 leave the effective scope → end transition
    expect(pauseAggregate.closeOpenCampaignAttributions).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ territoryIds: [2, 3] }),
    )
  })
})
