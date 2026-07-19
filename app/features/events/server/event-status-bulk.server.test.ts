import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => {
  const unscopedDb = {
    event: { findFirst: vi.fn(), update: vi.fn() },
    notificationEvent: { updateMany: vi.fn() },
    userAccount: { findFirst: vi.fn() },
  }
  return {
    unscopedDb,
    // Per-event bulk paths use withScope; the mock just invokes the callback
    // with the shared mock client so tests can program per-id behaviour via
    // event.findFirst.mockImplementation.
    withScope: vi.fn(async (_congregationId: number, fn: (tx: unknown) => unknown) => fn(unscopedDb)),
  }
})

vi.mock('~/shared/domain/audit.server', async importOriginal => {
  const actual = await importOriginal<typeof import('~/shared/domain/audit.server')>()
  return { ...actual, audit: vi.fn(), auditInTransaction: vi.fn() }
})

vi.mock('./notify-assignment.server', async importOriginal => {
  const actual = await importOriginal<typeof import('./notify-assignment.server')>()
  return { ...actual, notifyAssignment: vi.fn() }
})

const { bulkReleaseEvents, bulkUnreleaseEvents } = await import('./event-status-bulk.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { notifyAssignment } = await import('./notify-assignment.server')

const nctx = { locale: 'fr-FR', timezone: 'Europe/Paris' }
const draftEvent = {
  id: 42,
  name: 'Réunion',
  status: 'draft',
  startDate: new Date(2026, 3, 14),
  templateId: 7,
  parts: [] as unknown[],
  serviceRoles: [] as unknown[],
}
const releasedEvent = { ...draftEvent, status: 'released' }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('bulkReleaseEvents (per-event scope + post-tx notifications)', () => {
  it('classifies each event into released / blocked / notFound / failed', async () => {
    // 10 → not found; 20 → conflict-blocked; 30 → clean release.
    // biome-ignore lint/suspicious/noExplicitAny: mock signature needs to match Prisma's generated overloads
    vi.mocked(db.event.findFirst).mockImplementation(((args: any) => {
      const id = args?.where?.id as number
      if (id === 10) return Promise.resolve(null)
      if (id === 20) {
        return Promise.resolve({
          ...draftEvent,
          id: 20,
          parts: [{ id: 100, name: 'Part', hasConflict: true, assigneeId: 5, assistantId: null }],
          serviceRoles: [],
        })
      }
      return Promise.resolve({ ...draftEvent, id: 30 })
    }) as never)
    vi.mocked(db.event.update).mockResolvedValue({ ...releasedEvent, id: 30 } as never)

    const result = await bulkReleaseEvents([10, 20, 30], 1, 5, nctx)

    expect(result.released).toEqual([30])
    expect(result.blocked.map((b: { id: number }) => b.id)).toEqual([20])
    expect(result.notFound).toEqual([10])
    expect(result.failed).toEqual([])
  })

  // A Prisma error inside `withScope` (pool exhaustion, connection reset, tx
  // timeout) previously escaped the loop and 500'd the whole batch, silently
  // dropping partial progress. Now each event's release is caught and lands
  // in the `failed` bucket; the loop continues.
  it('lands per-event withScope failures in the `failed` bucket without aborting the batch', async () => {
    const { withScope } = await import('~/shared/infra/db.server')
    vi.mocked(withScope).mockImplementation(((_cid: number, fn: (tx: unknown) => unknown) => fn(db)) as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ ...draftEvent } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)
    vi.mocked(withScope)
      .mockImplementationOnce(((_cid: number, fn: (tx: unknown) => unknown) => fn(db)) as never)
      .mockImplementationOnce(() => Promise.reject(new Error('pool exhausted')))
      .mockImplementation(((_cid: number, fn: (tx: unknown) => unknown) => fn(db)) as never)

    const result = await bulkReleaseEvents([10, 20, 30], 1, 5, nctx)

    expect(result.released).toEqual([10, 30])
    expect(result.failed.map((f: { id: number }) => f.id)).toEqual([20])
  })

  // fireReleaseNotifications runs OUTSIDE the release tx. This test verifies
  // that after a successful release, notifyAssignment is invoked for every
  // computed target.
  it('fires notifyAssignment for each target of every released event', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      parts: [{ id: 100, name: 'Perle', hasConflict: false, assigneeId: 5, assistantId: null }],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    await bulkReleaseEvents([42], 1, 5, nctx)

    expect(notifyAssignment).toHaveBeenCalledTimes(1)
    expect(vi.mocked(notifyAssignment).mock.calls[0][2]).toMatchObject({ memberId: 5, role: 'speaker' })
  })

  it('returns empty buckets when the input list is empty', async () => {
    const result = await bulkReleaseEvents([], 1, 5, nctx)
    expect(result).toEqual({ released: [], blocked: [], notFound: [], failed: [] })
    expect(db.event.findFirst).not.toHaveBeenCalled()
  })
})

describe('bulkUnreleaseEvents (per-event scope)', () => {
  it('classifies each event into unreleased / notFound / failed', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock signature needs to match Prisma's generated overloads
    vi.mocked(db.event.findFirst).mockImplementation(((args: any) => {
      const id = args?.where?.id as number
      if (id === 10) return Promise.resolve(null)
      return Promise.resolve({ ...releasedEvent, id, parts: [], serviceRoles: [] })
    }) as never)
    vi.mocked(db.event.update).mockResolvedValue(draftEvent as never)

    const result = await bulkUnreleaseEvents([10, 20, 30], 1, 5)

    expect(result.unreleased).toEqual([20, 30])
    expect(result.notFound).toEqual([10])
    expect(result.failed).toEqual([])
  })

  it('lands per-event withScope failures in the `failed` bucket without aborting the batch', async () => {
    const { withScope } = await import('~/shared/infra/db.server')
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...releasedEvent,
      parts: [],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(draftEvent as never)
    vi.mocked(withScope)
      .mockImplementationOnce(((_cid: number, fn: (tx: unknown) => unknown) => fn(db)) as never)
      .mockImplementationOnce(() => Promise.reject(new Error('pool exhausted')))
      .mockImplementation(((_cid: number, fn: (tx: unknown) => unknown) => fn(db)) as never)

    const result = await bulkUnreleaseEvents([10, 20, 30], 1, 5)

    expect(result.unreleased).toEqual([10, 30])
    expect(result.failed.map((f: { id: number }) => f.id)).toEqual([20])
  })

  it('returns empty buckets when the input list is empty', async () => {
    const result = await bulkUnreleaseEvents([], 1, 5)
    expect(result).toEqual({ unreleased: [], notFound: [], failed: [] })
    expect(db.event.findFirst).not.toHaveBeenCalled()
  })
})
