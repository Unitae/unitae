import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./document-storage.server', () => ({
  deleteBoardFile: vi.fn(),
  saveBoardFile: vi.fn(),
  getBoardFile: vi.fn(),
  getBoardFileBuffer: vi.fn(),
}))

const { deleteSectionWithFiles, deleteFile } = await import('./document.server')
const { deleteBoardFile } = await import('./document-storage.server')

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

describe('deleteSectionWithFiles', () => {
  const mockDb = {
    boardDocument: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    boardSection: {
      delete: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.mocked(mockDb.boardDocument.findMany).mockResolvedValue([])
    vi.mocked(mockDb.boardDocument.deleteMany).mockResolvedValue({ count: 0 })
    vi.mocked(mockDb.boardSection.delete).mockResolvedValue({ id: 1, name: 'Section A', order: 0, congregationId: 10 })
    vi.mocked(deleteBoardFile).mockResolvedValue(undefined)
  })

  it('retourne le nom de la section supprimee', async () => {
    const result = await deleteSectionWithFiles(mockDb as never, 1, 10)
    expect(result).toEqual({ name: 'Section A' })
  })

  it('supprime les documents de la section avant de supprimer la section', async () => {
    vi.mocked(mockDb.boardDocument.findMany).mockResolvedValue([{ uri: '10/board/a.pdf' }, { uri: '10/board/b.pdf' }])

    await deleteSectionWithFiles(mockDb as never, 1, 10)

    expect(mockDb.boardDocument.deleteMany).toHaveBeenCalledWith({ where: { sectionId: 1 } })
    expect(mockDb.boardSection.delete).toHaveBeenCalled()
  })

  it('supprime les fichiers du stockage apres la suppression en base', async () => {
    vi.mocked(mockDb.boardDocument.findMany).mockResolvedValue([{ uri: '10/board/a.pdf' }, { uri: '10/board/b.pdf' }])

    await deleteSectionWithFiles(mockDb as never, 1, 10)

    expect(deleteBoardFile).toHaveBeenCalledWith('10/board/a.pdf')
    expect(deleteBoardFile).toHaveBeenCalledWith('10/board/b.pdf')
  })

  it('ne propage pas les erreurs de suppression de fichier', async () => {
    vi.mocked(mockDb.boardDocument.findMany).mockResolvedValue([{ uri: '10/board/fail.pdf' }])
    vi.mocked(deleteBoardFile).mockRejectedValue(new Error('storage error'))

    await expect(deleteSectionWithFiles(mockDb as never, 1, 10)).resolves.toEqual({ name: 'Section A' })
  })

  it('fonctionne quand la section est vide', async () => {
    vi.mocked(mockDb.boardDocument.findMany).mockResolvedValue([])

    await deleteSectionWithFiles(mockDb as never, 1, 10)

    expect(deleteBoardFile).not.toHaveBeenCalled()
    expect(mockDb.boardSection.delete).toHaveBeenCalled()
  })
})
