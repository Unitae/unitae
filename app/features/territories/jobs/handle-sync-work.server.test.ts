import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/congregation.server', () => ({
  resolveCongregation: vi.fn(),
}))

vi.mock('~/shared/infra/db.server', () => ({
  withScope: vi.fn(),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}))

vi.mock('../server/import-open-data.server', () => ({
  importOpenData: vi.fn(),
}))

vi.mock('../server/send-mail-after-data-sync.server', () => ({
  sendMailAfterDataSync: vi.fn(),
}))

const { handleSyncWork } = await import('./handle-sync-work.server')
const { resolveCongregation } = await import('~/shared/domain/congregation.server')
const { withScope } = await import('~/shared/infra/db.server')
const { importOpenData } = await import('../server/import-open-data.server')
const { sendMailAfterDataSync } = await import('../server/send-mail-after-data-sync.server')

function makeJob(data: Record<string, unknown> = {}) {
  return {
    id: 'test-job-1',
    data: { congregationId: 42, userEmail: 'user@test.com', userName: 'Test User', ...data },
    attemptsMade: 0,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(resolveCongregation).mockResolvedValue({ id: 42, name: 'Test' } as never)
  vi.mocked(withScope).mockImplementation(async (_id, fn) => fn({} as never))
  vi.mocked(importOpenData).mockResolvedValue(undefined)
  vi.mocked(sendMailAfterDataSync).mockResolvedValue(undefined)
})

describe('handleSyncWork', () => {
  it('exécute le sync avec le bon congregationId', async () => {
    const job = makeJob()
    await handleSyncWork(job as never)

    expect(vi.mocked(withScope)).toHaveBeenCalledWith(42, expect.any(Function))
    expect(vi.mocked(importOpenData)).toHaveBeenCalledWith({}, 42, expect.any(Function))
  })

  it('envoie un mail après le sync réussi', async () => {
    const job = makeJob()
    await handleSyncWork(job as never)

    expect(vi.mocked(sendMailAfterDataSync)).toHaveBeenCalledWith('user@test.com', 'Test User', expect.anything())
  })

  it('propage les erreurs sans les masquer', async () => {
    vi.mocked(importOpenData).mockRejectedValue(new Error('sync failed'))
    const job = makeJob()

    await expect(handleSyncWork(job as never)).rejects.toThrow('sync failed')
  })

  it('marque la progression à 100 quand le sync réussit', async () => {
    const job = makeJob()
    await handleSyncWork(job as never)

    expect(job.updateProgress).toHaveBeenLastCalledWith(100)
  })
})
