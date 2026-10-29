import { beforeEach, describe, expect, it, vi } from 'vitest'

const audit = vi.fn()
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { BoardDynamicDocumentUpdated: 'board.dynamic_document.updated' },
  audit,
}))

const { updateDynamicDocument } = await import('./update-dynamic-document.server')

const findFirst = vi.fn()
const update = vi.fn()
const db = { boardDynamicDocumentSettings: { findFirst, update } }

const changes = {
  title: 'Groupes',
  sectionId: 3,
  visibleFrom: null,
  visibleUntil: null,
  isHighlighted: false,
  showServices: false,
}

beforeEach(() => {
  vi.resetAllMocks()
  update.mockImplementation(({ data }) => Promise.resolve({ id: 5, ...data }))
})

describe('updateDynamicDocument', () => {
  it('saves the document’s settings in this congregation, and records who did', async () => {
    findFirst.mockResolvedValue({ dynamicType: 'publisher-groups' })

    const saved = await updateDynamicDocument(db as never, 5, 10, 99, changes)

    expect(saved).toMatchObject({ id: 5, title: 'Groupes' })
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 5, congregationId: 10 }, select: { dynamicType: true } })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_congregationId: { id: 5, congregationId: 10 } } }),
    )
    expect(audit).toHaveBeenCalledWith({
      action: 'board.dynamic_document.updated',
      congregationId: 10,
      actorId: 99,
      entityType: 'BoardDynamicDocumentSettings',
      entityId: 5,
    })
  })

  it('stores the chosen appearance', async () => {
    findFirst.mockResolvedValue({ dynamicType: 'publisher-groups' })

    const saved = await updateDynamicDocument(db as never, 5, 10, 99, {
      ...changes,
      appearance: { typeface: 'serif', accent: 'wine', layout: 'bands' },
    })

    expect(saved).toMatchObject({ appearance: { typeface: 'serif', accent: 'wine', layout: 'bands' } })
  })

  it('stores a layout the document does not offer as its default', async () => {
    findFirst.mockResolvedValue({ dynamicType: 'programme' })

    const saved = await updateDynamicDocument(db as never, 5, 10, 99, {
      ...changes,
      appearance: { typeface: 'fira', accent: 'teal', layout: 'bands' },
    })

    expect(saved).toMatchObject({ appearance: { layout: 'list' } })
  })

  it('leaves the appearance alone when none is sent', async () => {
    findFirst.mockResolvedValue({ dynamicType: 'organigram' })

    await updateDynamicDocument(db as never, 5, 10, 99, changes)

    expect(update.mock.calls[0][0].data).not.toHaveProperty('appearance')
  })

  it('returns null for a document this congregation does not have, writing nothing', async () => {
    findFirst.mockResolvedValue(null)

    expect(await updateDynamicDocument(db as never, 5, 10, 99, changes)).toBeNull()
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
})
