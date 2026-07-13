import { beforeEach, describe, expect, it, vi } from 'vitest'

const UUID_PDF_RE = /^[0-9a-f-]+\.pdf$/
const UUID_THUMB_RE = /^[0-9a-f-]+\.thumb\.png$/
const BOARD_PDF_KEY_RE = /^congregations\/\d+\/board\/[0-9a-f-]+\.pdf$/
const BOARD_THUMB_KEY_RE = /^congregations\/\d+\/board\/[0-9a-f-]+\.thumb\.png$/

const mockBuildStorageKey = vi.fn()
const mockDeleteFileFromStorage = vi.fn()
const mockGetFile = vi.fn()
const mockGetFileBuffer = vi.fn()
const mockUploadFile = vi.fn()

vi.mock('~/shared/infra/file-storage.server', () => ({
  buildStorageKey: mockBuildStorageKey,
  deleteFileFromStorage: mockDeleteFileFromStorage,
  getFile: mockGetFile,
  getFileBuffer: mockGetFileBuffer,
  uploadFile: mockUploadFile,
}))

const {
  deleteBoardFile,
  getBoardFile,
  getBoardFileBuffer,
  getStorageKey,
  getThumbnailStorageKey,
  saveBoardFile,
  saveThumbnailFile,
} = await import('./document-storage.server')

beforeEach(() => {
  vi.resetAllMocks()
  mockBuildStorageKey.mockImplementation(
    (congId: number, prefix: string, filename: string) => `congregations/${congId}/${prefix}/${filename}`,
  )
})

describe('getStorageKey', () => {
  it('builds a `board/{uuid}.pdf` key under the congregation prefix', () => {
    const key = getStorageKey(42)
    expect(mockBuildStorageKey).toHaveBeenCalledWith(42, 'board', expect.stringMatching(UUID_PDF_RE))
    expect(key).toMatch(BOARD_PDF_KEY_RE)
  })

  it('produces distinct keys on each call (uuid is random)', () => {
    const a = getStorageKey(1)
    const b = getStorageKey(1)
    expect(a).not.toBe(b)
  })
})

describe('getThumbnailStorageKey', () => {
  it('produces a `.thumb.png` key under the congregation board prefix', () => {
    const key = getThumbnailStorageKey(7)
    expect(mockBuildStorageKey).toHaveBeenCalledWith(7, 'board', expect.stringMatching(UUID_THUMB_RE))
    expect(key).toMatch(BOARD_THUMB_KEY_RE)
  })
})

describe('saveBoardFile', () => {
  it('uploads the file buffer with its declared content type', async () => {
    const file = new File(['pdf-bytes'], 'doc.pdf', { type: 'application/pdf' })
    await saveBoardFile(3, file)
    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.stringMatching(BOARD_PDF_KEY_RE),
      expect.any(ArrayBuffer),
      'application/pdf',
    )
  })

  it('falls back to application/pdf when the file has no type', async () => {
    const file = new File(['pdf-bytes'], 'doc.pdf', { type: '' })
    await saveBoardFile(3, file)
    expect(mockUploadFile).toHaveBeenCalledWith(expect.any(String), expect.any(ArrayBuffer), 'application/pdf')
  })

  it('returns the generated key', async () => {
    const file = new File(['pdf-bytes'], 'doc.pdf', { type: 'application/pdf' })
    const key = await saveBoardFile(3, file)
    expect(key).toMatch(BOARD_PDF_KEY_RE)
  })
})

describe('saveThumbnailFile', () => {
  it('uploads the buffer as image/png under the thumbnail key', async () => {
    const buffer = Buffer.from('png-bytes')
    const key = await saveThumbnailFile(5, buffer)
    expect(key).toMatch(BOARD_THUMB_KEY_RE)
    expect(mockUploadFile).toHaveBeenCalledWith(key, buffer, 'image/png')
  })
})

describe('read + delete wrappers', () => {
  it('getBoardFile delegates to file-storage.getFile', () => {
    getBoardFile('key')
    expect(mockGetFile).toHaveBeenCalledWith('key')
  })

  it('getBoardFileBuffer delegates to file-storage.getFileBuffer', () => {
    getBoardFileBuffer('key')
    expect(mockGetFileBuffer).toHaveBeenCalledWith('key')
  })

  it('deleteBoardFile delegates to file-storage.deleteFileFromStorage', async () => {
    await deleteBoardFile('key')
    expect(mockDeleteFileFromStorage).toHaveBeenCalledWith('key')
  })
})
