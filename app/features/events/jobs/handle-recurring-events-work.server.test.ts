import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { congregation: { findMany: vi.fn() } },
  withScope: vi.fn(),
}))
vi.mock('~/features/events/server/recurring-events.server', () => ({ extendRecurringEvents: vi.fn() }))

const { unscopedDb, withScope } = await import('~/shared/infra/db.server')
const { extendRecurringEvents } = await import('~/features/events/server/recurring-events.server')
const { handleRecurringEventsWork } = await import('./handle-recurring-events-work.server')

const job = { id: 'j1', data: { triggeredAt: '2026-11-17T01:00:00Z' } } as Job<{ triggeredAt: string }>
const db = {} as never

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(withScope).mockImplementation(((_id: number, fn: (tx: never) => unknown) =>
    Promise.resolve(fn(db))) as never)
  vi.mocked(extendRecurringEvents).mockResolvedValue(3)
})

describe('handleRecurringEventsWork', () => {
  it('extends every active, non-suspended congregation in its own time zone and scope', async () => {
    vi.mocked(unscopedDb.congregation.findMany).mockResolvedValue([
      { id: 1, slug: 'lilas', timezone: 'Europe/Paris' },
      { id: 2, slug: 'montreal', timezone: 'America/Toronto' },
    ] as never)

    await handleRecurringEventsWork(job)

    expect(vi.mocked(unscopedDb.congregation.findMany).mock.calls[0]?.[0]).toMatchObject({
      where: { active: true, suspendedAt: null },
    })
    expect(vi.mocked(withScope).mock.calls.map(([id]) => id)).toEqual([1, 2])
    expect(vi.mocked(extendRecurringEvents).mock.calls.map(([, args]) => [args.congregationId, args.timeZone])).toEqual(
      [
        [1, 'Europe/Paris'],
        [2, 'America/Toronto'],
      ],
    )
  })

  it('keeps going when one congregation fails', async () => {
    vi.mocked(unscopedDb.congregation.findMany).mockResolvedValue([
      { id: 1, slug: 'lilas', timezone: 'Europe/Paris' },
      { id: 2, slug: 'pantin', timezone: 'Europe/Paris' },
    ] as never)
    vi.mocked(extendRecurringEvents).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(2)

    // Every congregation is served, then the job fails so the failure shows where failed jobs are watched.
    await expect(handleRecurringEventsWork(job)).rejects.toThrow('1 of 2')
    expect(extendRecurringEvents).toHaveBeenCalledTimes(2)
  })
})
