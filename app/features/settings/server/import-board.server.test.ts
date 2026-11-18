import { beforeEach, describe, expect, it, vi } from 'vitest'

const readNdjsonFile = vi.fn()
vi.mock('./ndjson-archive', () => ({ readNdjsonFile: (...args: unknown[]) => readNdjsonFile(...args) }))
vi.mock('~/shared/infra/file-storage.server', () => ({ buildStorageKey: vi.fn(), uploadFile: vi.fn() }))

const { importBoardDynamicDocumentSettings } = await import('./import-board.server')
const { EntityIdMap } = await import('./data-transfer.type')

const db = {
  boardDynamicDocumentSettings: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Programme',
    dynamicType: 'programme',
    dynamicRef: null,
    sectionId: 4,
    order: 1,
    visibleFrom: null,
    visibleUntil: null,
    isHighlighted: false,
    showServices: true,
    appearance: null,
    ...overrides,
  }
}

function idMap() {
  const map = new EntityIdMap()
  map.set('board-sections', 4, 40)
  map.set('programme-templates', 3, 30)
  map.set('programme-templates', 5, 50)
  return map
}

let nextId = 100
beforeEach(() => {
  vi.resetAllMocks()
  nextId = 100
  db.boardDynamicDocumentSettings.create.mockImplementation(({ data }) => Promise.resolve({ id: nextId++, ...data }))
  // Like the database: the documents created so far can be found again.
  db.boardDynamicDocumentSettings.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(
      db.boardDynamicDocumentSettings.create.mock.results
        .map(result => result.value)
        .find(() => where?.dynamicType != null) ?? null,
    ),
  )
})

function created() {
  return db.boardDynamicDocumentSettings.create.mock.calls.map(([{ data }]) => data)
}

describe('importBoardDynamicDocumentSettings', () => {
  // Every programme document has an empty ref: matching on (type, ref) folded them all into the last one.
  it('creates each document of the archive, several programmes included', async () => {
    readNdjsonFile.mockResolvedValue([
      record({ id: 1, title: 'Programme de semaine' }),
      record({ id: 2, title: 'Programme du week-end' }),
    ])
    const map = idMap()

    await importBoardDynamicDocumentSettings({} as never, db as never, map, 1)

    expect(created().map(data => data.title)).toEqual(['Programme de semaine', 'Programme du week-end'])
    expect(db.boardDynamicDocumentSettings.update).not.toHaveBeenCalled()
    expect([
      map.getOptional('board-dynamic-document-settings', 1),
      map.getOptional('board-dynamic-document-settings', 2),
    ]).toEqual([100, 101])
  })

  it('carries a programme document’s configuration, its templates read through the imported ones', async () => {
    readNdjsonFile.mockResolvedValue([
      record({
        dynamicConfig: {
          templates: [
            { templateId: 3, parts: true, services: false },
            { templateId: 5, parts: false, services: true },
            // A template the archive did not bring: the document no longer lists it.
            { templateId: 7, parts: true, services: true },
          ],
          groupBy: 'template',
        },
      }),
    ])

    await importBoardDynamicDocumentSettings({} as never, db as never, idMap(), 1)

    expect(created()[0].dynamicConfig).toEqual({
      templates: [
        { templateId: 30, parts: true, services: false },
        { templateId: 50, parts: false, services: true },
      ],
      groupBy: 'template',
    })
  })

  it('imports a document without configuration (before v2.16) as before: with none', async () => {
    readNdjsonFile.mockResolvedValue([record()])

    await importBoardDynamicDocumentSettings({} as never, db as never, idMap(), 1)

    expect(created()[0].dynamicConfig).toBeUndefined()
  })

  it('keeps the configuration of another kind of document as it is', async () => {
    readNdjsonFile.mockResolvedValue([record({ dynamicType: 'organigram', dynamicConfig: { anything: 1 } })])

    await importBoardDynamicDocumentSettings({} as never, db as never, idMap(), 1)

    expect(created()[0].dynamicConfig).toEqual({ anything: 1 })
  })

  it('skips a document whose section was not imported', async () => {
    readNdjsonFile.mockResolvedValue([record({ sectionId: 9 })])

    await importBoardDynamicDocumentSettings({} as never, db as never, idMap(), 1)

    expect(db.boardDynamicDocumentSettings.create).not.toHaveBeenCalled()
  })
})
