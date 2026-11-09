import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./document-storage.server', () => ({
  deleteBoardFile: vi.fn(),
  saveBoardFile: vi.fn(),
  getBoardFile: vi.fn(),
  getBoardFileBuffer: vi.fn(),
}))

const { deleteFile, getFileStream } = await import('./document.server')
const { deleteBoardFile, getBoardFile } = await import('./document-storage.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('deleteFile', () => {
  it('appelle deleteBoardFile avec la cle du document', async () => {
    vi.mocked(deleteBoardFile).mockResolvedValue(undefined)

    await deleteFile({ uri: '1/board/abc.pdf' })
    expect(deleteBoardFile).toHaveBeenCalledWith('1/board/abc.pdf')
  })

  it('ne propage pas les erreurs de suppression de fichier', async () => {
    vi.mocked(deleteBoardFile).mockRejectedValue(new Error('storage error'))

    await expect(deleteFile({ uri: '1/board/abc.pdf' })).resolves.toBeUndefined()
  })
})

describe('getFileStream Content-Disposition header', () => {
  beforeEach(() => {
    vi.mocked(getBoardFile).mockResolvedValue({
      body: new ReadableStream(),
      contentType: 'application/pdf',
    })
  })

  it('encodes non-ASCII titles using RFC 5987 filename* syntax', async () => {
    const document = { uri: 'k', title: 'Programme — Mai 2026' } as never
    const response = await getFileStream(document)
    const header = response?.headers.get('Content-Disposition') ?? ''

    expect(header).toContain("filename*=UTF-8''")
    expect(header).toContain(encodeURIComponent('Programme — Mai 2026.pdf'))
  })

  it('provides an ASCII fallback that strips non-ASCII characters', async () => {
    const document = { uri: 'k', title: 'Programme — Mai 2026' } as never
    const response = await getFileStream(document)
    const header = response?.headers.get('Content-Disposition') ?? ''

    expect(header).toContain('filename="Programme _ Mai 2026.pdf"')
  })

  it('escapes double quotes in the ASCII fallback to keep the header parseable', async () => {
    const document = { uri: 'k', title: 'Quote"Test' } as never
    const response = await getFileStream(document)
    const header = response?.headers.get('Content-Disposition') ?? ''

    expect(header).toContain('filename="QuoteTest.pdf"')
  })

  it('does not throw when title contains characters outside the byte range', async () => {
    const document = { uri: 'k', title: 'Réunion publique — printemps' } as never

    await expect(getFileStream(document)).resolves.not.toBeNull()
  })
})
