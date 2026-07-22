import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./data-transfer-queue.server', () => ({
  dataTransferQueue: {
    getJob: vi.fn(),
  },
}))

const { getOwnedDataTransferJob } = await import('./data-transfer.queries')
const { dataTransferQueue } = await import('./data-transfer-queue.server')

const OWNER_CONGREGATION = 4242
const OTHER_CONGREGATION = 9999

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getOwnedDataTransferJob', () => {
  it('returns null when the job does not exist', async () => {
    vi.mocked(dataTransferQueue.getJob).mockResolvedValue(undefined)

    await expect(getOwnedDataTransferJob('missing-id', OWNER_CONGREGATION, 'export')).resolves.toBeNull()
  })

  it('returns null when the job belongs to another congregation', async () => {
    vi.mocked(dataTransferQueue.getJob).mockResolvedValue({
      id: 'foreign-id',
      data: { type: 'export', congregationId: OTHER_CONGREGATION, userId: 1, options: {} },
    } as never)

    await expect(getOwnedDataTransferJob('foreign-id', OWNER_CONGREGATION, 'export')).resolves.toBeNull()
  })

  it('returns null when the job type does not match the requested type', async () => {
    vi.mocked(dataTransferQueue.getJob).mockResolvedValue({
      id: 'import-id',
      data: { type: 'import', congregationId: OWNER_CONGREGATION, userId: 1, storageKey: 'k' },
    } as never)

    await expect(getOwnedDataTransferJob('import-id', OWNER_CONGREGATION, 'export')).resolves.toBeNull()
  })

  it('returns the job when both congregation and type match', async () => {
    const job = {
      id: 'own-id',
      data: { type: 'export', congregationId: OWNER_CONGREGATION, userId: 1, options: {} },
    }
    vi.mocked(dataTransferQueue.getJob).mockResolvedValue(job as never)

    await expect(getOwnedDataTransferJob('own-id', OWNER_CONGREGATION, 'export')).resolves.toBe(job)
  })
})
