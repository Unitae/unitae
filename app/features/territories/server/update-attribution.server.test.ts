import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'

vi.mock('~/shared/infra/db.server', () => ({
  // aggregate.update runs a findFirst precondition and _assertNoActiveOverlap
  // (findMany) when dates change. Provide sensible defaults so each test
  // exercises the update path.
  unscopedDb: {
    attribution: { update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('./attribution-eligibility.policy', () => ({ assertPublisherAllowedForAttribution: vi.fn() }))

const { updateAttribution } = await import('./update-attribution.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { assertPublisherAllowedForAttribution } = await import('./attribution-eligibility.policy')

beforeEach(() => {
  vi.resetAllMocks()
  // Default: existing attribution matches the incoming params so no overlap
  // check fires (publisherId/dates unchanged). Individual tests override.
  vi.mocked(db.attribution.findFirst).mockResolvedValue({
    id: 5,
    publisherId: 3,
    territoryId: 42,
    startDate: new Date('2025-01-01'),
    endDate: null,
  } as never)
  vi.mocked(db.attribution.findMany).mockResolvedValue([])
})

describe('updateAttribution', () => {
  it('returns the updated attribution with required fields only', async () => {
    const fake = { id: 1, publisherId: 10, type: TerritoryAttributionKind.Default }
    vi.mocked(db.attribution.update).mockResolvedValue(fake as never)

    const result = await updateAttribution(db as never, 1, 1, 99, {
      publisherId: 10,
      notes: 'test',
      type: TerritoryAttributionKind.Default,
      startDate: new Date('2025-01-01'),
    })

    expect(result).toEqual(fake)
  })

  it('does not include lateDate or endDate when not provided', async () => {
    vi.mocked(db.attribution.update).mockResolvedValue({} as never)
    const startDate = new Date('2025-03-01')

    await updateAttribution(db as never, 5, 2, 99, {
      publisherId: 3,
      notes: 'note',
      type: TerritoryAttributionKind.Phone,
      startDate,
    })

    const call = vi.mocked(db.attribution.update).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data).not.toHaveProperty('lateDate')
    expect(call.data).not.toHaveProperty('endDate')
    expect(call.data.publisherId).toBe(3)
    expect(call.data.startDate).toBe(startDate)
  })

  it('includes lateDate when provided', async () => {
    vi.mocked(db.attribution.update).mockResolvedValue({} as never)
    const lateDate = new Date('2025-06-01')

    await updateAttribution(db as never, 5, 2, 99, {
      publisherId: 3,
      notes: '',
      type: TerritoryAttributionKind.Default,
      startDate: new Date('2025-01-01'),
      lateDate,
    })

    const call = vi.mocked(db.attribution.update).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data.lateDate).toBe(lateDate)
  })

  it('includes endDate when provided', async () => {
    vi.mocked(db.attribution.update).mockResolvedValue({} as never)
    const endDate = new Date('2025-12-31')

    await updateAttribution(db as never, 5, 2, 99, {
      publisherId: 3,
      notes: '',
      type: TerritoryAttributionKind.Default,
      startDate: new Date('2025-01-01'),
      endDate,
    })

    const call = vi.mocked(db.attribution.update).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data.endDate).toBe(endDate)
  })

  it("gates the incoming publisher against the attribution's territory kind", async () => {
    vi.mocked(db.attribution.update).mockResolvedValue({} as never)

    await updateAttribution(db as never, 5, 2, 99, {
      publisherId: 10,
      notes: '',
      type: TerritoryAttributionKind.Default,
      startDate: new Date('2025-01-01'),
    })

    expect(assertPublisherAllowedForAttribution).toHaveBeenCalledWith(db, 5, 10, 2)
  })

  it('updates nothing when the publisher fails the role gate', async () => {
    vi.mocked(assertPublisherAllowedForAttribution).mockRejectedValue(new Error('publisher_role_not_allowed'))

    await expect(
      updateAttribution(db as never, 5, 2, 99, {
        publisherId: 10,
        notes: '',
        type: TerritoryAttributionKind.Default,
        startDate: new Date('2025-01-01'),
      }),
    ).rejects.toThrow('publisher_role_not_allowed')
    expect(db.attribution.update).not.toHaveBeenCalled()
  })
})
