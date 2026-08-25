import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/domain/settings.server', () => ({
  getSetting: vi.fn(),
}))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('./campaign.queries', () => ({ getActiveCampaign: vi.fn() }))
vi.mock('./attribution-eligibility.policy', () => ({ assertPublisherAllowedForKind: vi.fn() }))

const mockDb = {
  // aggregate.assign runs _assertNoActiveOverlap (findMany) and the
  // occupied-territory guard for campaign assignments (findFirst).
  attribution: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  // findFirst resolves the kind for the role gate; findUniqueOrThrow is the aggregate's own read.
  territory: { findUniqueOrThrow: vi.fn(), findFirst: vi.fn() },
}

const { createAttribution } = await import('./create-attribution.server')
const { getSetting } = await import('~/shared/domain/settings.server')
const { getActiveCampaign } = await import('./campaign.queries')
const { assertPublisherAllowedForKind } = await import('./attribution-eligibility.policy')
const { ConflictError } = await import('~/shared/errors/app-error.server')

const baseParams = {
  publisherId: 1,
  territoryId: 2,
  startDate: '2025-03-15',
  notes: 'test',
  congregationId: 10,
  actorId: 99,
}

// Local midnight of the input — must match parseLocalDate behavior.
const expectedStartDate = new Date(2025, 2, 15)

function buildExpectedLateDate(addDays: number): Date {
  const next = new Date(expectedStartDate)
  next.setDate(next.getDate() + addDays)
  return next
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getSetting).mockResolvedValue(undefined)
  vi.mocked(getActiveCampaign).mockResolvedValue(null as never)
  mockDb.attribution.create.mockResolvedValue({} as never)
  mockDb.attribution.findMany.mockResolvedValue([])
  mockDb.attribution.findFirst.mockResolvedValue(null as never)
  mockDb.territory.findUniqueOrThrow.mockResolvedValue({ type: TerritoryKindKey.Classical } as never)
  mockDb.territory.findFirst.mockResolvedValue({ type: TerritoryKindKey.Classical } as never)
})

describe('createAttribution', () => {
  it('stores startDate at local midnight, not UTC midnight', async () => {
    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default })

    const call = mockDb.attribution.create.mock.calls[0][0]
    expect(call.data.startDate).toEqual(expectedStartDate)
  })

  it('uses default duration of 120 days when no setting exists', async () => {
    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default })

    const call = mockDb.attribution.create.mock.calls[0][0]
    expect(call.data.lateDate).toEqual(buildExpectedLateDate(120))
  })

  it('uses configured default duration in days from setting', async () => {
    vi.mocked(getSetting).mockResolvedValue('90')

    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default })

    const call = mockDb.attribution.create.mock.calls[0][0]
    expect(call.data.lateDate).toEqual(buildExpectedLateDate(90))
  })

  it('uses phone duration (14 days) for phone attribution type', async () => {
    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Phone })

    const call = mockDb.attribution.create.mock.calls[0][0]
    expect(call.data.lateDate).toEqual(buildExpectedLateDate(14))
  })

  it('makes a campaign attribution due when the campaign closes', async () => {
    vi.mocked(getActiveCampaign).mockResolvedValue({
      id: 5,
      endDate: new Date(2025, 4, 20),
      endCloseCampaign: true,
    } as never)

    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default, campaignId: 5 })

    const call = mockDb.attribution.create.mock.calls[0][0]
    expect(call.data.lateDate).toEqual(new Date(2025, 4, 21))
  })

  it('uses commerce duration (120 days) for commerce territory type', async () => {
    mockDb.territory.findUniqueOrThrow.mockResolvedValue({ type: TerritoryKindKey.Commerces } as never)

    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default })

    const call = mockDb.attribution.create.mock.calls[0][0]
    expect(call.data.lateDate).toEqual(buildExpectedLateDate(120))
  })

  it('returns the created attribution', async () => {
    const fake = { id: 42, publisherId: 1, territoryId: 2 }
    mockDb.attribution.create.mockResolvedValue(fake as never)

    const result = await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default })

    expect(result).toEqual(fake)
  })

  it('creates nothing when the publisher fails the role gate', async () => {
    vi.mocked(assertPublisherAllowedForKind).mockRejectedValue(new ConflictError('publisher_role_not_allowed'))

    await expect(
      createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default }),
    ).rejects.toThrow('publisher_role_not_allowed')
    expect(mockDb.attribution.create).not.toHaveBeenCalled()
  })

  it('creates the attribution when the gate passes', async () => {
    mockDb.territory.findFirst.mockResolvedValue({ type: TerritoryKindKey.Phone } as never)

    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default })

    expect(mockDb.attribution.create).toHaveBeenCalled()
  })
})
