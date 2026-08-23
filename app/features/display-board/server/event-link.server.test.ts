import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    boardDynamicDocumentSettings: { findMany: vi.fn() },
    event: { findFirst: vi.fn() },
  },
}))

const warnSpy = vi.fn()
vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: warnSpy, error: vi.fn() }),
}))

const { resolveProgrammeLink } = await import('./event-link.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

// A document only ever renders released events from the start of the current
// month onwards, so every case below starts from an event that qualifies and
// varies only what it means to.
const IN_WINDOW = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 5)

function showable(templateKey = 'weekly-meeting') {
  return { status: 'released', startDate: IN_WINDOW, template: { key: templateKey } }
}

beforeEach(() => {
  vi.resetAllMocks()
  warnSpy.mockReset()
  vi.mocked(db.event.findFirst).mockResolvedValue(showable() as never)
})

describe('resolveProgrammeLink', () => {
  it('returns /board when no programme dynamic document exists in the congregation', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([] as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board')
  })

  it('returns /board when the event has no templateId (custom event, no template linkage)', async () => {
    const url = await resolveProgrammeLink(db, { id: 100, templateId: null }, 1)
    expect(url).toBe('/board')
    expect(db.boardDynamicDocumentSettings.findMany).not.toHaveBeenCalled()
  })

  it('matches via dynamicConfig.templates[].templateId (multi-template mode)', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      {
        id: 42,
        dynamicType: 'programme',
        dynamicRef: null,
        dynamicConfig: { templates: [{ templateId: 5, parts: true, services: false }], groupBy: 'date' },
      },
    ] as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board/dynamic/42/viewer?eventId=100')
  })

  it('does not match when dynamicConfig.templates references a different templateId', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      {
        id: 42,
        dynamicType: 'programme',
        dynamicRef: null,
        dynamicConfig: { templates: [{ templateId: 999, parts: true, services: false }], groupBy: 'date' },
      },
    ] as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board')
  })

  it('falls back to matching via dynamicRef when dynamicConfig is null (legacy single-template mode)', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      {
        id: 42,
        dynamicType: 'programme',
        dynamicRef: 'weekly-meeting',
        dynamicConfig: null,
      },
    ] as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(showable('weekly-meeting') as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board/dynamic/42/viewer?eventId=100')
  })

  it('returns /board when the legacy dynamicRef does not match the event template key', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      {
        id: 42,
        dynamicType: 'programme',
        dynamicRef: 'public-talk',
        dynamicConfig: null,
      },
    ] as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(showable('weekly-meeting') as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board')
  })

  it('prefers a config-based match over a legacy dynamicRef candidate that appears earlier in the list', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      {
        id: 10,
        dynamicType: 'programme',
        dynamicRef: 'weekly-meeting',
        dynamicConfig: null,
      },
      {
        id: 20,
        dynamicType: 'programme',
        dynamicRef: null,
        dynamicConfig: { templates: [{ templateId: 5, parts: true, services: false }], groupBy: 'date' },
      },
    ] as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    // Config-based match at index 1 wins over the legacy candidate at index 0.
    expect(url).toBe('/board/dynamic/20/viewer?eventId=100')
  })

  it('matches a multi-template config when the event templateId appears past index 0', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      {
        id: 42,
        dynamicType: 'programme',
        dynamicRef: null,
        dynamicConfig: {
          templates: [
            { templateId: 1, parts: true, services: false },
            { templateId: 5, parts: true, services: true },
            { templateId: 8, parts: false, services: true },
          ],
          groupBy: 'date',
        },
      },
    ] as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board/dynamic/42/viewer?eventId=100')
  })

  it('reads the event even when no candidate carries a legacy dynamicRef', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      {
        id: 42,
        dynamicType: 'programme',
        dynamicRef: null,
        dynamicConfig: { templates: [{ templateId: 999, parts: true, services: false }], groupBy: 'date' },
      },
    ] as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board')
    // The read is no longer a legacy-only shortcut: whether a document can hold
    // the event at all is decided from its status and date.
    expect(db.event.findFirst).toHaveBeenCalledTimes(1)
  })

  it('logs a warning and skips a candidate whose dynamicConfig JSON is malformed', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      {
        id: 42,
        dynamicType: 'programme',
        dynamicRef: null,
        dynamicConfig: { garbage: true }, // not a valid ProgrammeDynamicConfig
      },
    ] as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board')
    expect(warnSpy).toHaveBeenCalledWith(
      'programme dynamic doc has malformed dynamicConfig, skipping',
      expect.objectContaining({ candidateId: 42, congregationId: 1 }),
    )
  })

  it('does not warn about legacy rows whose dynamicConfig is genuinely null', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      {
        id: 42,
        dynamicType: 'programme',
        dynamicRef: 'weekly-meeting',
        dynamicConfig: null,
      },
    ] as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(showable('weekly-meeting') as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board/dynamic/42/viewer?eventId=100')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('logs a warning when the event disappears between the write and this read', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      {
        id: 42,
        dynamicType: 'programme',
        dynamicRef: 'weekly-meeting',
        dynamicConfig: null,
      },
    ] as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board')
    expect(warnSpy).toHaveBeenCalledWith(
      'programme link fell back to /board: event missing at resolve time',
      expect.objectContaining({ eventId: 100, templateId: 5, congregationId: 1 }),
    )
  })
})

describe('resolveProgrammeLink only points at a document that holds the event', () => {
  const NEXT_MONTH = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 5)
  const LAST_MONTH = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 5)

  function docs(...configs: { id: number; templateIds: number[] }[]) {
    return configs.map(c => ({
      id: c.id,
      dynamicRef: null,
      dynamicConfig: { templates: c.templateIds.map(templateId => ({ templateId, parts: true, services: true })) },
    }))
  }

  it('sends nobody to a document that filters their event out for being a draft', async () => {
    // Documents only ever render released events, so a draft assignment shared
    // by its manager would land the reader on a programme without it.
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue(docs({ id: 3, templateIds: [9] }) as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({
      status: 'draft',
      startDate: NEXT_MONTH,
      template: { key: 'weekend' },
    } as never)

    expect(await resolveProgrammeLink(db, { id: 1, templateId: 9 }, 1)).toBe('/board')
  })

  it('sends nobody to a document whose window has moved past the event', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue(docs({ id: 3, templateIds: [9] }) as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({
      status: 'released',
      startDate: LAST_MONTH,
      template: { key: 'weekend' },
    } as never)

    expect(await resolveProgrammeLink(db, { id: 1, templateId: 9 }, 1)).toBe('/board')
  })

  it('links to the document when the event is one it actually shows', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue(docs({ id: 3, templateIds: [9] }) as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({
      status: 'released',
      startDate: NEXT_MONTH,
      template: { key: 'weekend' },
    } as never)

    expect(await resolveProgrammeLink(db, { id: 1, templateId: 9 }, 1)).toBe('/board/dynamic/3/viewer?eventId=1')
  })

  it('prefers the document dedicated to this programme over a catch-all', async () => {
    // Several documents can legitimately hold the same event. The narrower one
    // is the likelier destination; id order alone would hand out whichever was
    // created first.
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue(
      docs({ id: 3, templateIds: [9, 10, 11] }, { id: 8, templateIds: [9] }) as never,
    )
    vi.mocked(db.event.findFirst).mockResolvedValue({
      status: 'released',
      startDate: NEXT_MONTH,
      template: { key: 'weekend' },
    } as never)

    expect(await resolveProgrammeLink(db, { id: 1, templateId: 9 }, 1)).toBe('/board/dynamic/8/viewer?eventId=1')
  })

  it('stays deterministic when two documents are equally specific', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue(
      docs({ id: 8, templateIds: [9] }, { id: 3, templateIds: [9] }) as never,
    )
    vi.mocked(db.event.findFirst).mockResolvedValue({
      status: 'released',
      startDate: NEXT_MONTH,
      template: { key: 'weekend' },
    } as never)

    expect(await resolveProgrammeLink(db, { id: 1, templateId: 9 }, 1)).toBe('/board/dynamic/3/viewer?eventId=1')
  })
})
