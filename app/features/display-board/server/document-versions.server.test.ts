import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDeleteFile = vi.fn()
const mockDeleteBoardFile = vi.fn()
const mockThumbnailQueueAdd = vi.fn()

vi.mock('./document.server', () => ({ deleteFile: mockDeleteFile }))
vi.mock('./document-storage.server', () => ({ deleteBoardFile: mockDeleteBoardFile }))
vi.mock('./thumbnail-queue.server', () => ({
  thumbnailQueue: { add: mockThumbnailQueueAdd },
}))
vi.mock('~/shared/infra/logger.server', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const mockDb = {
  boardDocumentVersion: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  boardDocument: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}

// biome-ignore lint/suspicious/noExplicitAny: mocked transaction client is intentionally partial
const dbCast = mockDb as any

const { createVersionForUpload, deleteAllVersionFiles, restoreDocumentVersion } = await import(
  './document-versions.server'
)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createVersionForUpload', () => {
  it('numbers the first version as 1 when no prior version exists', async () => {
    mockDb.boardDocumentVersion.findFirst.mockResolvedValue(null)

    await createVersionForUpload(dbCast, 100, 1, 42, 'board/abc.pdf')

    expect(mockDb.boardDocumentVersion.create).toHaveBeenCalledWith({
      data: {
        documentId: 100,
        uri: 'board/abc.pdf',
        thumbnailUri: null,
        versionNumber: 1,
        uploadedById: 42,
        congregationId: 1,
      },
    })
  })

  it('increments versionNumber from the previous max', async () => {
    mockDb.boardDocumentVersion.findFirst.mockResolvedValue({ versionNumber: 7 })
    await createVersionForUpload(dbCast, 100, 1, 42, 'board/xyz.pdf')
    expect(mockDb.boardDocumentVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ versionNumber: 8 }),
    })
  })

  it('records the passed thumbnailUri when provided', async () => {
    mockDb.boardDocumentVersion.findFirst.mockResolvedValue(null)
    await createVersionForUpload(dbCast, 100, 1, 42, 'board/xyz.pdf', 'board/xyz.thumb.png')
    expect(mockDb.boardDocumentVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ thumbnailUri: 'board/xyz.thumb.png' }),
    })
  })
})

describe('restoreDocumentVersion', () => {
  it('returns null when the version does not exist', async () => {
    mockDb.boardDocumentVersion.findUnique.mockResolvedValue(null)
    const result = await restoreDocumentVersion(dbCast, 100, 999, 1, 42)
    expect(result).toBeNull()
    expect(mockDb.boardDocument.update).not.toHaveBeenCalled()
  })

  it('returns null when the version belongs to a different document', async () => {
    mockDb.boardDocumentVersion.findUnique.mockResolvedValue({ id: 999, documentId: 999, uri: 'x' })
    const result = await restoreDocumentVersion(dbCast, 100, 999, 1, 42)
    expect(result).toBeNull()
  })

  it('records a fresh version, updates the document uri, and enqueues thumbnail regeneration', async () => {
    mockDb.boardDocumentVersion.findUnique.mockResolvedValue({
      id: 5,
      documentId: 100,
      uri: 'board/old.pdf',
      thumbnailUri: null,
      versionNumber: 3,
    })
    mockDb.boardDocument.findUnique.mockResolvedValue({ uri: 'board/current.pdf', thumbnailUri: 'board/thumb.png' })
    mockDb.boardDocumentVersion.findFirst.mockResolvedValue({ versionNumber: 4 })

    const result = await restoreDocumentVersion(dbCast, 100, 5, 1, 42)

    expect(result).toEqual({ versionNumber: 3 })

    expect(mockDb.boardDocumentVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ uri: 'board/old.pdf', versionNumber: 5 }),
    })
    expect(mockDb.boardDocument.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 100, congregationId: 1 } },
      data: { uri: 'board/old.pdf', thumbnailUri: null },
    })
    expect(mockDeleteFile).toHaveBeenCalledWith({ uri: 'board/thumb.png' })
    expect(mockThumbnailQueueAdd).toHaveBeenCalledWith('generate-thumbnail', {
      congregationId: 1,
      documentId: 100,
      pdfStorageKey: 'board/old.pdf',
    })
  })

  it('does not delete the current thumbnail when the document had none', async () => {
    mockDb.boardDocumentVersion.findUnique.mockResolvedValue({
      id: 5,
      documentId: 100,
      uri: 'board/old.pdf',
      versionNumber: 3,
    })
    mockDb.boardDocument.findUnique.mockResolvedValue({ uri: 'board/current.pdf', thumbnailUri: null })
    mockDb.boardDocumentVersion.findFirst.mockResolvedValue(null)

    await restoreDocumentVersion(dbCast, 100, 5, 1, 42)

    expect(mockDeleteFile).not.toHaveBeenCalled()
  })
})

describe('deleteAllVersionFiles', () => {
  it('deletes every version pdf and thumbnail', async () => {
    mockDb.boardDocumentVersion.findMany.mockResolvedValue([
      { uri: 'board/v1.pdf', thumbnailUri: 'board/v1.thumb.png' },
      { uri: 'board/v2.pdf', thumbnailUri: null },
    ])

    await deleteAllVersionFiles(dbCast, 100)

    expect(mockDeleteBoardFile).toHaveBeenCalledTimes(3)
    expect(mockDeleteBoardFile).toHaveBeenCalledWith('board/v1.pdf')
    expect(mockDeleteBoardFile).toHaveBeenCalledWith('board/v1.thumb.png')
    expect(mockDeleteBoardFile).toHaveBeenCalledWith('board/v2.pdf')
  })

  it('continues cleanup even when one deletion throws', async () => {
    mockDb.boardDocumentVersion.findMany.mockResolvedValue([
      { uri: 'board/v1.pdf', thumbnailUri: null },
      { uri: 'board/v2.pdf', thumbnailUri: null },
    ])
    mockDeleteBoardFile.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined)

    await deleteAllVersionFiles(dbCast, 100)

    expect(mockDeleteBoardFile).toHaveBeenCalledTimes(2)
  })

  it('does nothing when the document has no versions', async () => {
    mockDb.boardDocumentVersion.findMany.mockResolvedValue([])
    await deleteAllVersionFiles(dbCast, 100)
    expect(mockDeleteBoardFile).not.toHaveBeenCalled()
  })
})
