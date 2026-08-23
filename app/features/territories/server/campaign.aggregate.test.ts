import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError } from '~/shared/errors/app-error.server'

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))

const mockDb = {
  campaign: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  attribution: { count: vi.fn() },
  campaignTerritory: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}

const { campaignWindowsOverlap, createCampaign, updateCampaign, deleteCampaign } = await import('./campaign.aggregate')
const { audit } = await import('~/shared/domain/audit.server')

const d = (iso: string) => new Date(iso)

describe('campaignWindowsOverlap', () => {
  it('detects intersecting windows', () => {
    expect(
      campaignWindowsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-03-01') },
        { startDate: d('2026-02-01'), endDate: d('2026-04-01') },
      ),
    ).toBe(true)
  })

  it('treats windows sharing exactly one day as overlapping (endDate is inclusive)', () => {
    expect(
      campaignWindowsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-03-01') },
        { startDate: d('2026-03-01'), endDate: d('2026-04-01') },
      ),
    ).toBe(true)
  })

  it('allows back-to-back windows one day apart', () => {
    expect(
      campaignWindowsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-02-28') },
        { startDate: d('2026-03-01'), endDate: d('2026-04-01') },
      ),
    ).toBe(false)
  })

  it('detects full containment', () => {
    expect(
      campaignWindowsOverlap(
        { startDate: d('2026-01-01'), endDate: d('2026-12-31') },
        { startDate: d('2026-05-01'), endDate: d('2026-06-01') },
      ),
    ).toBe(true)
  })

  it('is symmetric', () => {
    const a = { startDate: d('2026-01-01'), endDate: d('2026-03-01') }
    const b = { startDate: d('2026-02-01'), endDate: d('2026-04-01') }
    expect(campaignWindowsOverlap(a, b)).toBe(campaignWindowsOverlap(b, a))
  })
})

const baseParams = {
  name: 'Invitation Mémorial 2026',
  notes: '',
  startDate: '2026-01-15',
  endDate: '2026-03-01',
  restPeriodDays: null,
  startRegularAction: 'Pause' as const,
  startAutoReassign: false,
  endCloseCampaign: true,
  endRegularAction: 'Resume' as const,
  scopeTerritoryIds: [] as number[],
  congregationId: 10,
  actorId: 99,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.campaign.findMany.mockResolvedValue([])
  mockDb.campaign.create.mockResolvedValue({ id: 1 } as never)
  mockDb.campaign.update.mockResolvedValue({ id: 1 } as never)
  mockDb.campaign.delete.mockResolvedValue({ id: 1 } as never)
  mockDb.campaignTerritory.createMany.mockResolvedValue({ count: 0 } as never)
  mockDb.campaignTerritory.deleteMany.mockResolvedValue({ count: 0 } as never)
  mockDb.attribution.count.mockResolvedValue(0)
})

describe('createCampaign', () => {
  it('stores day-granular local dates', async () => {
    await createCampaign(mockDb as never, baseParams)

    const call = mockDb.campaign.create.mock.calls[0][0]
    expect(call.data.startDate).toEqual(new Date(2026, 0, 15))
    expect(call.data.endDate).toEqual(new Date(2026, 2, 1))
  })

  it('rejects a window overlapping an existing campaign with campaign_overlap', async () => {
    mockDb.campaign.findMany.mockResolvedValue([
      { id: 7, startDate: new Date(2026, 1, 1), endDate: new Date(2026, 3, 1) },
    ] as never)

    await expect(createCampaign(mockDb as never, baseParams)).rejects.toThrow(ConflictError)
    await expect(createCampaign(mockDb as never, baseParams)).rejects.toThrow('campaign_overlap')
    expect(mockDb.campaign.create).not.toHaveBeenCalled()
  })

  it('accepts a window that does not overlap any existing campaign', async () => {
    mockDb.campaign.findMany.mockResolvedValue([
      { id: 7, startDate: new Date(2026, 3, 2), endDate: new Date(2026, 4, 1) },
    ] as never)

    await createCampaign(mockDb as never, baseParams)
    expect(mockDb.campaign.create).toHaveBeenCalled()
  })

  it('creates scope rows carrying congregationId', async () => {
    await createCampaign(mockDb as never, { ...baseParams, scopeTerritoryIds: [3, 4] })

    const call = mockDb.campaignTerritory.createMany.mock.calls[0][0]
    expect(call.data).toEqual([
      { campaignId: 1, territoryId: 3, congregationId: 10 },
      { campaignId: 1, territoryId: 4, congregationId: 10 },
    ])
  })

  it('creates no scope rows for an unscoped campaign', async () => {
    await createCampaign(mockDb as never, baseParams)
    expect(mockDb.campaignTerritory.createMany).not.toHaveBeenCalled()
  })

  it('audits the creation', async () => {
    await createCampaign(mockDb as never, baseParams)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'Campaign', entityId: 1 }))
  })
})

describe('updateCampaign', () => {
  beforeEach(() => {
    mockDb.campaign.findFirst.mockResolvedValue({
      id: 1,
      activatedAt: null,
      endedAt: null,
    } as never)
  })

  it('excludes the campaign itself from the overlap check', async () => {
    mockDb.campaign.findMany.mockResolvedValue([] as never)

    await updateCampaign(mockDb as never, 1, 10, 99, baseParams)

    const where = mockDb.campaign.findMany.mock.calls[0][0].where
    expect(where.id).toEqual({ not: 1 })
  })

  it('rejects when the new window overlaps another campaign', async () => {
    mockDb.campaign.findMany.mockResolvedValue([
      { id: 7, startDate: new Date(2026, 1, 1), endDate: new Date(2026, 3, 1) },
    ] as never)

    await expect(updateCampaign(mockDb as never, 1, 10, 99, baseParams)).rejects.toThrow('campaign_overlap')
  })

  it('never touches the scope — scope edits go through the lifecycle workflow', async () => {
    await updateCampaign(mockDb as never, 1, 10, 99, baseParams)

    expect(mockDb.campaignTerritory.deleteMany).not.toHaveBeenCalled()
    expect(mockDb.campaignTerritory.createMany).not.toHaveBeenCalled()
  })

  it('throws NotFound for an unknown campaign', async () => {
    mockDb.campaign.findFirst.mockResolvedValue(null as never)
    await expect(updateCampaign(mockDb as never, 1, 10, 99, baseParams)).rejects.toThrow('Campaign')
  })
})

describe('deleteCampaign', () => {
  it('forbids deleting an active campaign', async () => {
    mockDb.campaign.findFirst.mockResolvedValue({
      id: 1,
      activatedAt: new Date(2026, 0, 15),
      endedAt: null,
    } as never)

    await expect(deleteCampaign(mockDb as never, 1, 10, 99)).rejects.toThrow('campaign_active')
    expect(mockDb.campaign.delete).not.toHaveBeenCalled()
  })

  it('deletes a scheduled campaign', async () => {
    mockDb.campaign.findFirst.mockResolvedValue({ id: 1, activatedAt: null, endedAt: null } as never)

    await deleteCampaign(mockDb as never, 1, 10, 99)
    expect(mockDb.campaign.delete).toHaveBeenCalled()
  })

  it('refuses to delete a campaign still referenced by attributions', async () => {
    mockDb.campaign.findFirst.mockResolvedValue({
      id: 1,
      activatedAt: new Date(2026, 0, 15),
      endedAt: new Date(2026, 2, 1),
    } as never)
    mockDb.attribution.count.mockResolvedValue(3)

    await expect(deleteCampaign(mockDb as never, 1, 10, 99)).rejects.toThrow('campaign_has_attributions')
    expect(mockDb.campaign.delete).not.toHaveBeenCalled()
  })

  it('deletes an ended campaign', async () => {
    mockDb.campaign.findFirst.mockResolvedValue({
      id: 1,
      activatedAt: new Date(2026, 0, 15),
      endedAt: new Date(2026, 2, 1),
    } as never)

    await deleteCampaign(mockDb as never, 1, 10, 99)
    expect(mockDb.campaign.delete).toHaveBeenCalled()
  })
})
