import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))

const mockDb = {
  attribution: { update: vi.fn(), findFirst: vi.fn() },
}

const aggregate = await import('./attribution-pause.aggregate')

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.attribution.update.mockResolvedValue({ id: 42 } as never)
  mockDb.attribution.findFirst.mockResolvedValue(null as never)
})

describe('pause', () => {
  it('stamps pausedAt and pausedByCampaignId on an open, unpaused attribution', async () => {
    mockDb.attribution.findFirst.mockResolvedValue({ id: 42, endDate: null, pausedAt: null } as never)
    const now = new Date(2026, 0, 15)

    await aggregate.pause(mockDb as never, 42, 10, 5, 99, now)

    const call = mockDb.attribution.update.mock.calls[0][0]
    expect(call.data).toMatchObject({ pausedAt: now, pausedByCampaignId: 5 })
  })

  it('refuses to pause an already returned attribution', async () => {
    mockDb.attribution.findFirst.mockResolvedValue({ id: 42, endDate: new Date(), pausedAt: null } as never)

    await expect(aggregate.pause(mockDb as never, 42, 10, 5, 99, new Date())).rejects.toThrow('attribution_not_open')
  })

  it('refuses to pause an already paused attribution', async () => {
    mockDb.attribution.findFirst.mockResolvedValue({ id: 42, endDate: null, pausedAt: new Date() } as never)

    await expect(aggregate.pause(mockDb as never, 42, 10, 5, 99, new Date())).rejects.toThrow(
      'attribution_already_paused',
    )
  })
})

describe('resume', () => {
  it('clears the pause state and shifts lateDate by the paused duration', async () => {
    const pausedAt = new Date(2026, 0, 15)
    const lateDate = new Date(2026, 1, 1)
    mockDb.attribution.findFirst.mockResolvedValue({ id: 42, endDate: null, pausedAt, lateDate } as never)
    const now = new Date(2026, 2, 1) // 45 days paused

    await aggregate.resume(mockDb as never, 42, 10, 99, now)

    const call = mockDb.attribution.update.mock.calls[0][0]
    expect(call.data.pausedAt).toBeNull()
    expect(call.data.pausedByCampaignId).toBeNull()
    const expectedLate = new Date(lateDate.getTime() + (now.getTime() - pausedAt.getTime()))
    expect(call.data.lateDate).toEqual(expectedLate)
  })

  it('refuses to resume an attribution that is not paused', async () => {
    mockDb.attribution.findFirst.mockResolvedValue({ id: 42, endDate: null, pausedAt: null } as never)

    await expect(aggregate.resume(mockDb as never, 42, 10, 99, new Date())).rejects.toThrow('attribution_not_paused')
  })

  it('throws NotFound for an unknown attribution', async () => {
    mockDb.attribution.findFirst.mockResolvedValue(null as never)

    await expect(aggregate.resume(mockDb as never, 42, 10, 99, new Date())).rejects.toThrow('Attribution')
  })
})

// ——— bulk campaign transitions ———

const bulkDb = {
  attribution: {
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}

const params = { congregationId: 10, campaignId: 5, territoryIds: null, actorId: 0, now: new Date(2026, 0, 15) }

beforeEach(() => {
  bulkDb.attribution.findMany.mockResolvedValue([])
  bulkDb.attribution.update.mockResolvedValue({} as never)
  bulkDb.attribution.updateMany.mockResolvedValue({ count: 0 } as never)
})

describe('pauseOpenRegulars', () => {
  it('pauses only open, unpaused regular attributions and stamps the campaign', async () => {
    bulkDb.attribution.findMany.mockResolvedValue([{ id: 1, publisherId: 2, territoryId: 3 }] as never)

    const rows = await aggregate.pauseOpenRegulars(bulkDb as never, params)

    const where = bulkDb.attribution.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ congregationId: 10, endDate: null, campaignId: null, pausedAt: null })
    const upd = bulkDb.attribution.updateMany.mock.calls[0][0]
    expect(upd.where.id).toEqual({ in: [1] })
    expect(upd.data).toMatchObject({ pausedAt: params.now, pausedByCampaignId: 5 })
    expect(rows).toEqual([{ id: 1, publisherId: 2, territoryId: 3 }])
  })

  it('filters by scope territories when provided', async () => {
    await aggregate.pauseOpenRegulars(bulkDb as never, { ...params, territoryIds: [7, 8] })

    const where = bulkDb.attribution.findMany.mock.calls[0][0].where
    expect(where.territoryId).toEqual({ in: [7, 8] })
  })

  it('does nothing when no attribution matches', async () => {
    const rows = await aggregate.pauseOpenRegulars(bulkDb as never, params)
    expect(rows).toEqual([])
    expect(bulkDb.attribution.updateMany).not.toHaveBeenCalled()
  })
})

describe('closeOpenRegulars', () => {
  it('returns open regular attributions in scope by setting endDate', async () => {
    bulkDb.attribution.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }] as never)

    const count = await aggregate.closeOpenRegulars(bulkDb as never, { ...params, territoryIds: [7] })

    const where = bulkDb.attribution.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ endDate: null, campaignId: null, territoryId: { in: [7] } })
    const upd = bulkDb.attribution.updateMany.mock.calls[0][0]
    expect(upd.data).toMatchObject({ endDate: params.now })
    expect(count).toBe(2)
  })
})

describe('resumePausedBy', () => {
  it('resumes only attributions paused by this campaign, shifting each lateDate', async () => {
    const pausedAt = new Date(2025, 11, 1)
    bulkDb.attribution.findMany.mockResolvedValue([{ id: 1, pausedAt, lateDate: new Date(2025, 11, 20) }] as never)

    const count = await aggregate.resumePausedBy(bulkDb as never, params)

    const where = bulkDb.attribution.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ pausedByCampaignId: 5, endDate: null })
    const upd = bulkDb.attribution.update.mock.calls[0][0]
    expect(upd.data.pausedAt).toBeNull()
    expect(upd.data.pausedByCampaignId).toBeNull()
    const expected = new Date(new Date(2025, 11, 20).getTime() + (params.now.getTime() - pausedAt.getTime()))
    expect(upd.data.lateDate).toEqual(expected)
    expect(count).toBe(1)
  })
})

describe('closePausedBy', () => {
  it('returns attributions paused by this campaign and clears the pause state', async () => {
    bulkDb.attribution.findMany.mockResolvedValue([{ id: 1 }] as never)

    const count = await aggregate.closePausedBy(bulkDb as never, params)

    const where = bulkDb.attribution.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ pausedByCampaignId: 5, endDate: null })
    const upd = bulkDb.attribution.updateMany.mock.calls[0][0]
    expect(upd.data).toMatchObject({ endDate: params.now, pausedAt: null, pausedByCampaignId: null })
    expect(count).toBe(1)
  })
})

describe('closeOpenCampaignAttributions', () => {
  it('closes open attributions belonging to the campaign', async () => {
    bulkDb.attribution.findMany.mockResolvedValue([{ id: 9 }] as never)

    const count = await aggregate.closeOpenCampaignAttributions(bulkDb as never, params)

    const where = bulkDb.attribution.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ campaignId: 5, endDate: null })
    const upd = bulkDb.attribution.updateMany.mock.calls[0][0]
    expect(upd.data).toMatchObject({ endDate: params.now })
    expect(count).toBe(1)
  })

  it('restricts to scope territories when provided (scope removal)', async () => {
    await aggregate.closeOpenCampaignAttributions(bulkDb as never, { ...params, territoryIds: [4] })

    const where = bulkDb.attribution.findMany.mock.calls[0][0].where
    expect(where.territoryId).toEqual({ in: [4] })
  })
})
