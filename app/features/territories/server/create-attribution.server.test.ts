import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/domain/settings.server', () => ({
  getSetting: vi.fn(),
}))
// biome-ignore lint/style/useNamingConvention: AuditAction is a PascalCase constant by convention
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))

const mockDb = {
  attribution: { create: vi.fn() },
  territory: { findUniqueOrThrow: vi.fn() },
}

const { createAttribution } = await import('./create-attribution.server')
const { getSetting } = await import('~/shared/domain/settings.server')

const baseParams = {
  publisherId: 1,
  territoryId: 2,
  startDate: '2025-03-15',
  notes: 'test',
  congregationId: 10,
  actorId: 99,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getSetting).mockResolvedValue(undefined)
  mockDb.attribution.create.mockResolvedValue({} as never)
  mockDb.territory.findUniqueOrThrow.mockResolvedValue({ type: TerritoryKind.Classical } as never)
})

describe('createAttribution', () => {
  it('uses default duration of 120 days when no setting exists', async () => {
    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default })

    const call = mockDb.attribution.create.mock.calls[0][0]
    const expected = new Date('2025-03-15')
    expected.setDate(expected.getDate() + 120)

    expect(call.data.lateDate).toEqual(expected)
    expect(call.data.startDate).toEqual(new Date('2025-03-15'))
  })

  it('uses configured default duration in days from setting', async () => {
    vi.mocked(getSetting).mockResolvedValue('90')

    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default })

    const call = mockDb.attribution.create.mock.calls[0][0]
    const expected = new Date('2025-03-15')
    expected.setDate(expected.getDate() + 90)

    expect(call.data.lateDate).toEqual(expected)
  })

  it('uses phone duration (14 days) for phone attribution type', async () => {
    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Phone })

    const call = mockDb.attribution.create.mock.calls[0][0]
    const expected = new Date('2025-03-15')
    expected.setDate(expected.getDate() + 14)

    expect(call.data.lateDate).toEqual(expected)
  })

  it('uses campaign duration (60 days) for campaign attribution type', async () => {
    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Campaign })

    const call = mockDb.attribution.create.mock.calls[0][0]
    const expected = new Date('2025-03-15')
    expected.setDate(expected.getDate() + 60)

    expect(call.data.lateDate).toEqual(expected)
  })

  it('uses commerce duration (120 days) for commerce territory type', async () => {
    mockDb.territory.findUniqueOrThrow.mockResolvedValue({ type: TerritoryKind.Commerces } as never)

    await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default })

    const call = mockDb.attribution.create.mock.calls[0][0]
    const expected = new Date('2025-03-15')
    expected.setDate(expected.getDate() + 120)

    expect(call.data.lateDate).toEqual(expected)
  })

  it('returns the created attribution', async () => {
    const fake = { id: 42, publisherId: 1, territoryId: 2 }
    mockDb.attribution.create.mockResolvedValue(fake as never)

    const result = await createAttribution(mockDb as never, { ...baseParams, type: TerritoryAttributionKind.Default })

    expect(result).toEqual(fake)
  })
})
