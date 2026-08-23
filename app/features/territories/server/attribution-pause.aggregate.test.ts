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
