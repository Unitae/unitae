import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
const { audit } = await import('~/shared/domain/audit.server')
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))

import { createDynamicDocument, deleteDynamicDocument, updateBoardDocument } from './board-document.server'

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

describe('createDynamicDocument', () => {
  it('creates a dynamic document settings record, visible from now', async () => {
    // The board only shows documents whose visibility window has opened. Born with a null
    // visibleFrom, a freshly added document flashed « ajouté » and then never appeared —
    // the admin had to guess that the optional date field on the edit page was the reason.
    const data = {
      title: 'Programme',
      dynamicType: 'programme',
      dynamicRef: null,
      sectionId: 2,
      congregationId: 10,
    }
    const expected = { id: 1, ...data }
    mockDb.boardDynamicDocumentSettings.create.mockResolvedValue(expected)

    const before = new Date()
    const result = await createDynamicDocument(mockDb as never, { ...data, actorId: 99 })

    expect(result).toEqual(expected)
    const written = mockDb.boardDynamicDocumentSettings.create.mock.calls[0]?.[0].data
    expect(written).toMatchObject(data)
    expect(written.visibleFrom).toBeInstanceOf(Date)
    expect(written.visibleFrom.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('records what its form chose, kept back or shown, and who added it', async () => {
    mockDb.boardDynamicDocumentSettings.create.mockResolvedValue({ id: 7 })
    const visibleUntil = new Date('2026-11-30T22:59:59.999Z')

    await createDynamicDocument(mockDb as never, {
      title: 'Groupes',
      dynamicType: 'publisher-groups',
      dynamicRef: null,
      sectionId: 2,
      congregationId: 10,
      actorId: 99,
      visibleFrom: null,
      visibleUntil,
      isHighlighted: true,
      showServices: false,
      appearance: { typeface: 'serif', accent: 'wine', layout: 'bands' },
    })

    expect(mockDb.boardDynamicDocumentSettings.create.mock.calls[0]?.[0].data).toMatchObject({
      visibleFrom: null,
      visibleUntil,
      isHighlighted: true,
      showServices: false,
      appearance: { typeface: 'serif', accent: 'wine', layout: 'bands' },
    })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 99, entityType: 'BoardDynamicDocumentSettings', entityId: 7 }),
    )
  })
})

describe('deleteDynamicDocument', () => {
  it('deletes a dynamic document using compound key', async () => {
    const expected = { id: 5 }
    mockDb.boardDynamicDocumentSettings.delete.mockResolvedValue(expected)

    const result = await deleteDynamicDocument(mockDb as never, 5, 10)

    expect(result).toEqual(expected)
    expect(mockDb.boardDynamicDocumentSettings.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 5, congregationId: 10 } },
    })
  })
})
