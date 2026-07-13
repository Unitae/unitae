import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberId } from '~/shared/types/branded'

const mockAnonymize = vi.fn()
const mockFindMany = vi.fn()
const mockAudit = vi.fn()

vi.mock('~/features/publishers/index.server', () => ({
  memberAggregate: { anonymize: mockAnonymize },
}))
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { RetentionAutoAnonymized: 'retention.auto_anonymized' },
  audit: mockAudit,
}))

const mockDb = { member: { findMany: mockFindMany } }
// biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
const dbCast = mockDb as any

const { findRetentionCandidates, autoAnonymizeRetentionCandidates } = await import('./anonymize-retention.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('findRetentionCandidates', () => {
  it('filters by leftAt <= (now - retention window) and anonymizedAt is null', async () => {
    mockFindMany.mockResolvedValue([])
    const now = new Date('2026-07-01T00:00:00Z')

    await findRetentionCandidates(dbCast, 42, 6, now)

    const call = mockFindMany.mock.calls[0][0]
    expect(call.where.congregationId).toBe(42)
    expect(call.where.anonymizedAt).toBeNull()
    expect(call.where.leftAt).toEqual({ not: null, lte: new Date('2026-01-01T00:00:00Z') })
  })

  it('returns the ids of members past the retention window', async () => {
    mockFindMany.mockResolvedValue([{ id: 10 }, { id: 20 }])
    const result = await findRetentionCandidates(dbCast, 42, 6, new Date('2026-07-01T00:00:00Z'))
    expect(result).toEqual([10, 20])
  })

  it('honours a shorter (3-month) window', async () => {
    mockFindMany.mockResolvedValue([])
    const now = new Date('2026-07-01T00:00:00Z')

    await findRetentionCandidates(dbCast, 42, 3, now)

    const call = mockFindMany.mock.calls[0][0]
    expect(call.where.leftAt.lte).toEqual(new Date('2026-04-01T00:00:00Z'))
  })

  it('honours a longer (24-month) window', async () => {
    mockFindMany.mockResolvedValue([])
    const now = new Date('2026-07-01T00:00:00Z')

    await findRetentionCandidates(dbCast, 42, 24, now)

    const call = mockFindMany.mock.calls[0][0]
    expect(call.where.leftAt.lte).toEqual(new Date('2024-07-01T00:00:00Z'))
  })
})

// Signature: (db, congregationId, retentionMonths, now, actorId).
// Actor is last per the aggregate-contract convention: `(db, ...domainParams, actorId)`.
describe('autoAnonymizeRetentionCandidates', () => {
  it('anonymizes every candidate returned by the finder', async () => {
    mockFindMany.mockResolvedValue([{ id: 10 }, { id: 20 }])
    mockAnonymize.mockResolvedValue(undefined)

    const result = await autoAnonymizeRetentionCandidates(dbCast, 42, 6, new Date('2026-07-01T00:00:00Z'), 0)

    expect(mockAnonymize).toHaveBeenCalledTimes(2)
    expect(mockAnonymize).toHaveBeenCalledWith(dbCast, 10, 42, 0)
    expect(mockAnonymize).toHaveBeenCalledWith(dbCast, 20, 42, 0)
    expect(result.anonymized).toBe(2)
    expect(result.skipped).toBe(0)
  })

  it('logs and continues past a candidate that throws (e.g. group responsible)', async () => {
    mockFindMany.mockResolvedValue([{ id: 10 }, { id: 20 }, { id: 30 }])
    mockAnonymize
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('group responsible'))
      .mockResolvedValueOnce(undefined)

    const result = await autoAnonymizeRetentionCandidates(dbCast, 42, 6, new Date('2026-07-01T00:00:00Z'), 0)

    expect(result.anonymized).toBe(2)
    expect(result.skipped).toBe(1)
  })

  it('is a no-op when no candidates are found — no audit fired', async () => {
    mockFindMany.mockResolvedValue([])
    const result = await autoAnonymizeRetentionCandidates(dbCast, 42, 6, new Date('2026-07-01T00:00:00Z'), 0)
    expect(mockAnonymize).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
    expect(result).toEqual({ anonymized: 0, skipped: 0 })
  })

  it('uses actorId = 0 to signal "system-driven" anonymization', async () => {
    mockFindMany.mockResolvedValue([{ id: 10 }])
    mockAnonymize.mockResolvedValue(undefined)

    await autoAnonymizeRetentionCandidates(dbCast, 42, 6, new Date('2026-07-01T00:00:00Z'), 0)

    expect((mockAnonymize.mock.calls[0] as unknown[])[3]).toBe(0)
  })

  it('emits one audit event when at least one candidate existed (anonymized > 0)', async () => {
    mockFindMany.mockResolvedValue([{ id: 10 }])
    mockAnonymize.mockResolvedValue(undefined)

    await autoAnonymizeRetentionCandidates(dbCast, 42, 6, new Date('2026-07-01T00:00:00Z'), 0)

    expect(mockAudit).toHaveBeenCalledOnce()
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'retention.auto_anonymized',
        congregationId: 42,
        actorId: 0,
        metadata: { anonymized: 1, skipped: 0, retentionMonths: 6 },
      }),
    )
  })

  it('emits an audit event even when every candidate was skipped (attempt-visibility)', async () => {
    mockFindMany.mockResolvedValue([{ id: 10 }])
    mockAnonymize.mockRejectedValueOnce(new Error('group responsible'))

    await autoAnonymizeRetentionCandidates(dbCast, 42, 6, new Date('2026-07-01T00:00:00Z'), 0)

    expect(mockAudit).toHaveBeenCalledOnce()
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'retention.auto_anonymized',
        metadata: { anonymized: 0, skipped: 1, retentionMonths: 6 },
      }),
    )
  })
})

// Type check for MemberId branded type, keeps the test module importing MemberId.
const _typeGuard: MemberId | undefined = undefined
void _typeGuard
