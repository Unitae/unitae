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

beforeEach(() => {
  vi.resetAllMocks()
  warnSpy.mockReset()
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
    vi.mocked(db.event.findFirst).mockResolvedValue({
      template: { key: 'weekly-meeting' },
    } as never)

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
    vi.mocked(db.event.findFirst).mockResolvedValue({
      template: { key: 'weekly-meeting' },
    } as never)

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
    // The legacy fallback path should never fire when a config match was found.
    expect(db.event.findFirst).not.toHaveBeenCalled()
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

  it('does not fetch the event when no candidates carry a legacy dynamicRef', async () => {
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
    // No legacy candidates means the second-fetch shortcut should skip entirely.
    expect(db.event.findFirst).not.toHaveBeenCalled()
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
    vi.mocked(db.event.findFirst).mockResolvedValue({ template: { key: 'weekly-meeting' } } as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board/dynamic/42/viewer?eventId=100')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('logs a warning when the event or template row disappears before the legacy path can resolve', async () => {
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
      'programme link fell back to /board: event or template missing at resolve time',
      expect.objectContaining({ eventId: 100, templateId: 5, congregationId: 1 }),
    )
  })

  it('returns the first matching document when several are configured for the same template', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findMany).mockResolvedValue([
      {
        id: 10,
        dynamicType: 'programme',
        dynamicRef: null,
        dynamicConfig: { templates: [{ templateId: 5, parts: true, services: false }], groupBy: 'date' },
      },
      {
        id: 20,
        dynamicType: 'programme',
        dynamicRef: null,
        dynamicConfig: { templates: [{ templateId: 5, parts: true, services: true }], groupBy: 'date' },
      },
    ] as never)

    const url = await resolveProgrammeLink(db, { id: 100, templateId: 5 }, 1)
    expect(url).toBe('/board/dynamic/10/viewer?eventId=100')
  })
})
