import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    boardDynamicDocumentSettings: { findMany: vi.fn() },
    event: { findFirst: vi.fn() },
  },
}))

const { resolveProgrammeLink } = await import('./programme-link.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
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
