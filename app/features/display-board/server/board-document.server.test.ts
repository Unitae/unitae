import { beforeEach, describe, expect, it, vi } from 'vitest'

// biome-ignore lint/style/useNamingConvention: AuditAction is a PascalCase constant by convention
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))

import {
  createDynamicDocument,
  deleteDynamicDocument,
  markDocumentAsViewed,
  updateBoardDocument,
  updateDynamicDocument,
} from './board-document.server'

const mockDb = {
  boardDocument: {
    update: vi.fn(),
  },
  boardDynamicDocumentSettings: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updateBoardDocument', () => {
  it('updates document with section connection and visibility dates', async () => {
    const expected = { id: 1, title: 'Lettre' }
    mockDb.boardDocument.update.mockResolvedValue(expected)

    const visibleFrom = new Date('2026-01-01')
    const visibleUntil = new Date('2026-02-01')
    const result = await updateBoardDocument(mockDb as never, 1, 10, 99, {
      title: 'Lettre',
      sectionId: 3,
      visibleFrom,
      visibleUntil,
      isHighlighted: true,
    })

    expect(result).toEqual(expected)
    expect(mockDb.boardDocument.update).toHaveBeenCalledWith({
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      where: { id_congregationId: { id: 1, congregationId: 10 } },
      data: {
        title: 'Lettre',
        section: { connect: { id: 3 } },
        visibleFrom,
        visibleUntil,
        isHighlighted: true,
      },
    })
  })
})

describe('markDocumentAsViewed', () => {
  it('connects the user to the viewedBy relation and selects id and title', async () => {
    const expected = { id: 7, title: 'Programme' }
    mockDb.boardDocument.update.mockResolvedValue(expected)

    const result = await markDocumentAsViewed(mockDb as never, 7, 42, 10)

    expect(result).toEqual(expected)
    expect(mockDb.boardDocument.update).toHaveBeenCalledWith({
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      where: { id_congregationId: { id: 7, congregationId: 10 } },
      data: { viewedBy: { connect: { id: 42 } } },
      select: { id: true, title: true },
    })
  })
})

describe('createDynamicDocument', () => {
  it('creates a dynamic document settings record', async () => {
    const data = {
      title: 'Programme',
      dynamicType: 'programme',
      dynamicRef: null,
      sectionId: 2,
      congregationId: 10,
    }
    const expected = { id: 1, ...data }
    mockDb.boardDynamicDocumentSettings.create.mockResolvedValue(expected)

    const result = await createDynamicDocument(mockDb as never, data)

    expect(result).toEqual(expected)
    expect(mockDb.boardDynamicDocumentSettings.create).toHaveBeenCalledWith({ data })
  })
})

describe('updateDynamicDocument', () => {
  it('updates a dynamic document using compound key', async () => {
    const data = {
      title: 'Updated',
      sectionId: 3,
      visibleFrom: null,
      visibleUntil: null,
      isHighlighted: false,
      showServices: true,
    }
    const expected = { id: 5, ...data }
    mockDb.boardDynamicDocumentSettings.update.mockResolvedValue(expected)

    const result = await updateDynamicDocument(mockDb as never, 5, 10, data)

    expect(result).toEqual(expected)
    expect(mockDb.boardDynamicDocumentSettings.update).toHaveBeenCalledWith({
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      where: { id_congregationId: { id: 5, congregationId: 10 } },
      data,
    })
  })
})

describe('deleteDynamicDocument', () => {
  it('deletes a dynamic document using compound key', async () => {
    const expected = { id: 5 }
    mockDb.boardDynamicDocumentSettings.delete.mockResolvedValue(expected)

    const result = await deleteDynamicDocument(mockDb as never, 5, 10)

    expect(result).toEqual(expected)
    expect(mockDb.boardDynamicDocumentSettings.delete).toHaveBeenCalledWith({
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      where: { id_congregationId: { id: 5, congregationId: 10 } },
    })
  })
})
