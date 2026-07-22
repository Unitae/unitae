import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./data-transfer-queue.server', () => ({
  dataTransferQueue: {
    getJob: vi.fn(),
  },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const { getOwnedDataTransferJob } = await import('./data-transfer.queries')
const { dataTransferQueue } = await import('./data-transfer-queue.server')

const OWNER_CONGREGATION = 4242
const OTHER_CONGREGATION = 9999
const ACTOR_ID = 7

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getOwnedDataTransferJob', () => {
  it('returns null when the job does not exist', async () => {
    vi.mocked(dataTransferQueue.getJob).mockResolvedValue(undefined)

    await expect(getOwnedDataTransferJob('missing-id', OWNER_CONGREGATION, ACTOR_ID, 'export')).resolves.toBeNull()
  })

  it('returns null when the job belongs to another congregation', async () => {
    vi.mocked(dataTransferQueue.getJob).mockResolvedValue({
      id: 'foreign-id',
      data: { type: 'export', congregationId: OTHER_CONGREGATION, userId: 1, options: {} },
    } as never)

    await expect(getOwnedDataTransferJob('foreign-id', OWNER_CONGREGATION, ACTOR_ID, 'export')).resolves.toBeNull()
  })

  it('returns null when the job type does not match the requested type', async () => {
    vi.mocked(dataTransferQueue.getJob).mockResolvedValue({
      id: 'import-id',
      data: { type: 'import', congregationId: OWNER_CONGREGATION, userId: 1, storageKey: 'k' },
    } as never)

    await expect(getOwnedDataTransferJob('import-id', OWNER_CONGREGATION, ACTOR_ID, 'export')).resolves.toBeNull()
  })

  it('returns the job when an owned export job matches the export type', async () => {
    const job = {
      id: 'own-export-id',
      data: { type: 'export', congregationId: OWNER_CONGREGATION, userId: 1, options: {} },
    }
    vi.mocked(dataTransferQueue.getJob).mockResolvedValue(job as never)

    await expect(getOwnedDataTransferJob('own-export-id', OWNER_CONGREGATION, ACTOR_ID, 'export')).resolves.toBe(job)
  })

  it('returns the job when an owned import job matches the import type', async () => {
    const job = {
      id: 'own-import-id',
      data: { type: 'import', congregationId: OWNER_CONGREGATION, userId: 1, storageKey: 'k' },
    }
    vi.mocked(dataTransferQueue.getJob).mockResolvedValue(job as never)

    await expect(getOwnedDataTransferJob('own-import-id', OWNER_CONGREGATION, ACTOR_ID, 'import')).resolves.toBe(job)
  })
})
