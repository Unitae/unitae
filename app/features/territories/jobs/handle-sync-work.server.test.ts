import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  withScope: vi.fn(),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}))

vi.mock('../server/import-open-data.server', () => ({
  importOpenData: vi.fn(),
}))

vi.mock('~/features/notifications/server/notify.server', () => ({
  notify: vi.fn(),
}))

const { handleSyncWork } = await import('./handle-sync-work.server')
const { withScope } = await import('~/shared/infra/db.server')
const { importOpenData } = await import('../server/import-open-data.server')
const { notify } = await import('~/features/notifications/server/notify.server')

function makeJob(data: Record<string, unknown> = {}) {
  return {
    id: 'test-job-1',
    data: { congregationId: 42, userId: 7, ...data },
    attemptsMade: 0,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(withScope).mockImplementation(async (_id, fn) => fn({} as never))
  vi.mocked(importOpenData).mockResolvedValue(undefined)
  vi.mocked(notify).mockResolvedValue(undefined)
})

describe('handleSyncWork', () => {
  it('runs the import scoped to the congregation', async () => {
    const job = makeJob()
    await handleSyncWork(job as never)

    expect(vi.mocked(withScope)).toHaveBeenCalledWith(42, expect.any(Function))
    expect(vi.mocked(importOpenData)).toHaveBeenCalledWith({}, 42, expect.any(Function))
  })

  it('notifies the requesting user via notify() after a successful sync', async () => {
    const job = makeJob()
    await handleSyncWork(job as never)

    expect(vi.mocked(notify)).toHaveBeenCalledWith(expect.anything(), {
      type: 'territory.sync.completed',
      entityType: 'Congregation',
      entityId: 42,
      congregationId: 42,
      recipientId: 7,
      actorId: 7,
    })
  })

  it('does not notify when the import fails', async () => {
    vi.mocked(importOpenData).mockRejectedValue(new Error('sync failed'))
    const job = makeJob()

    await expect(handleSyncWork(job as never)).rejects.toThrow('sync failed')
    expect(vi.mocked(notify)).not.toHaveBeenCalled()
  })

  it('marks progress at 100 when the sync succeeds', async () => {
    const job = makeJob()
    await handleSyncWork(job as never)

    expect(job.updateProgress).toHaveBeenLastCalledWith(100)
  })
})
