import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDeleteBoardFile } = vi.hoisted(() => ({ mockDeleteBoardFile: vi.fn() }))
vi.mock('./document-storage.server', () => ({
  deleteBoardFile: mockDeleteBoardFile,
  getBoardFile: vi.fn(),
  saveBoardFile: vi.fn().mockResolvedValue('board/new.pdf'),
}))
vi.mock('./document-versions.server', () => ({ createVersionForUpload: vi.fn() }))
vi.mock('./thumbnail-queue.server', () => ({ thumbnailQueue: { add: vi.fn() } }))
vi.mock('./file-validation.server', async importOriginal => ({
  ...(await importOriginal<object>()),
  validateBoardFile: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('~/shared/infra/logger.server', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { computeReorderedItems, replaceDocumentFile } from './document.server'

describe('computeReorderedItems', () => {
  it('moves the target item up, swapping it with the item before it', () => {
    const items = [
      { id: 1, order: 0 },
      { id: 2, order: 5 },
      { id: 3, order: 10 },
    ]
    const result = computeReorderedItems(items, 2, 'up')
    const ids = result.map(r => r.id)
    expect(ids).toEqual([2, 1, 3])
  })

  it('moves the target item down, swapping it with the item after it', () => {
    const items = [
      { id: 1, order: 0 },
      { id: 2, order: 5 },
      { id: 3, order: 10 },
    ]
    const result = computeReorderedItems(items, 2, 'down')
    const ids = result.map(r => r.id)
    expect(ids).toEqual([1, 3, 2])
  })

  it('assigns stable order values 0, 5, 10, ... regardless of original order values', () => {
    const items = [
      { id: 1, order: 0 },
      { id: 2, order: 5 },
      { id: 3, order: 10 },
    ]
    const result = computeReorderedItems(items, 1, 'down')
    expect(result.map(r => r.order)).toEqual([0, 5, 10])
  })

  it('first item moved up stays first (cannot move past the beginning)', () => {
    const items = [
      { id: 1, order: 0 },
      { id: 2, order: 5 },
      { id: 3, order: 10 },
    ]
    const result = computeReorderedItems(items, 1, 'up')
    expect(result.map(r => r.id)).toEqual([1, 2, 3])
  })

  it('last item moved down stays last (cannot move past the end)', () => {
    const items = [
      { id: 1, order: 0 },
      { id: 2, order: 5 },
      { id: 3, order: 10 },
    ]
    const result = computeReorderedItems(items, 3, 'down')
    expect(result.map(r => r.id)).toEqual([1, 2, 3])
  })

  it('handles a single item — returns it unchanged at order 0', () => {
    const items = [{ id: 1, order: 0 }]
    const result = computeReorderedItems(items, 1, 'up')
    expect(result).toEqual([{ id: 1, order: 0 }])
  })

  it('handles items with null order — uses array position as base', () => {
    const items = [
      { id: 1, order: null },
      { id: 2, order: null },
      { id: 3, order: null },
    ]
    const result = computeReorderedItems(items, 2, 'up')
    expect(result.map(r => r.id)).toEqual([2, 1, 3])
    expect(result.map(r => r.order)).toEqual([0, 5, 10])
  })

  it('two items — moving first down yields [second, first]', () => {
    const items = [
      { id: 1, order: 0 },
      { id: 2, order: 5 },
    ]
    const result = computeReorderedItems(items, 1, 'down')
    expect(result.map(r => r.id)).toEqual([2, 1])
  })

  it('two items — moving second up yields [second, first]', () => {
    const items = [
      { id: 1, order: 0 },
      { id: 2, order: 5 },
    ]
    const result = computeReorderedItems(items, 2, 'up')
    expect(result.map(r => r.id)).toEqual([2, 1])
  })
})

describe('replaceDocumentFile', () => {
  const pdf = new File(['%PDF-1.4'], 'lettre.pdf', { type: 'application/pdf' })
  const db = (referencedByHistory: number) =>
    ({
      boardDocument: {
        findUnique: vi.fn().mockResolvedValue({ uri: 'board/old.pdf', thumbnailUri: 'board/old.thumb.png' }),
        update: vi.fn(),
      },
      boardDocumentVersion: { count: vi.fn().mockResolvedValue(referencedByHistory) },
    }) as never

  beforeEach(() => mockDeleteBoardFile.mockReset())

  it('keeps the file it replaces when the history refers to it, so it can be downloaded and brought back', async () => {
    await replaceDocumentFile(db(1), 100, 1, 42, pdf)

    expect(mockDeleteBoardFile.mock.calls.map(([key]) => key)).toEqual(['board/old.thumb.png'])
  })

  it('deletes it when nothing refers to it, as for a document from before versions were kept', async () => {
    await replaceDocumentFile(db(0), 100, 1, 42, pdf)

    expect(mockDeleteBoardFile.mock.calls.map(([key]) => key)).toEqual(['board/old.pdf', 'board/old.thumb.png'])
  })
})
