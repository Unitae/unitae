import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The PDF URL is guessable, so the loader must be guarded exactly like the viewer: board
// permission plus the section visibility filter in the query. It reads the same data as the viewer, and refuses a document
// that would print as a blank page — the viewer hides its button for exactly those.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')
const congregationContext = Symbol('congregationContext')

const settingsFindFirst = vi.fn()
const fakeDb = {
  boardDynamicDocumentSettings: { findFirst: settingsFindFirst },
}

const requirePermission = vi.fn()
vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  congregationContext,
  requirePermission,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn(fakeDb),
}))

const renderPdfResponse = vi.fn().mockReturnValue(new Response('%PDF', { status: 200 }))
vi.mock('~/shared/infra/pdf.server', () => ({
  renderPdfResponse,
  sanitizeFilename: (name: string) => name,
}))

// The sheets pull in @react-pdf/renderer and font files — irrelevant to the guards.
const SHEET = { sheet: 'built' }
const buildBoardSheet = vi.fn()
vi.mock('~/features/display-board/ui/dynamic/pdf/board-sheet', () => ({ buildBoardSheet }))

const getDynamicDocumentData = vi.fn()
vi.mock('~/features/display-board/server/dynamic-documents.server', () => ({ getDynamicDocumentData }))
// A sentinel, so the tests can prove the filter lands inside the query itself.
const VISIBLE_SECTIONS = { OR: [{ marker: 'visible-to-this-account' }] }
const buildSectionVisibilityFilter = vi.fn()
vi.mock('~/features/display-board/server/section-visibility.server', () => ({ buildSectionVisibilityFilter }))
vi.mock('~/shared/infra/logger.server', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const { Permission } = await import('~/shared/types/permission')
const { DynamicType } = await import('~/features/display-board/model/dynamic-document.type')
const { loader } = await import('./pdf')

const context = {
  get: (key: symbol) => {
    if (key === permissionsContext) return new Set()
    // displayName is the resolved public name (displayName ?? name) — what every header shows.
    if (key === congregationContext) return { displayName: 'Assemblée de Lyon', timezone: 'Pacific/Noumea' }
    return { id: 1, congregationId: 10 }
  },
}

function download(search = '') {
  return loader({
    request: new Request(`http://localhost/board/dynamic/5/pdf${search}`),
    context,
    params: { dynamicId: '5' },
  } as never)
}

function documentSettings(dynamicType: string, title: string) {
  return { id: 5, dynamicType, dynamicRef: null, title, showServices: false, dynamicConfig: null }
}

/** What the sheet was built from: its data, its appearance and its options. */
function builtSheet(): { data: Record<string, unknown>; appearance: unknown; options: Record<string, unknown> } {
  const [data, appearance, options] = buildBoardSheet.mock.calls[0] ?? []
  return { data, appearance, options }
}

// « Now » is mid-October in Nouméa: the programme sheet prints October and November.
const NOW = new Date('2026-10-15T01:00:00Z')
const meeting = (id: number, day: string) => ({ id, templateId: 3, startDate: new Date(`${day}T08:00:00Z`) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  renderPdfResponse.mockReturnValue(new Response('%PDF', { status: 200 }))
  buildBoardSheet.mockResolvedValue(SHEET)
  buildSectionVisibilityFilter.mockResolvedValue(VISIBLE_SECTIONS)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the dynamic document PDF loader', () => {
  it('requires the board permission before reading anything', async () => {
    requirePermission.mockImplementationOnce(() => {
      throw new Response(null, { status: 403 })
    })

    await expect(async () => download()).rejects.toMatchObject({ status: 403 })
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), Permission.CanViewBoard)
    expect(settingsFindFirst).not.toHaveBeenCalled()
  })

  it('looks the document up through this account’s section visibility, inside the query', async () => {
    settingsFindFirst.mockResolvedValue(null)

    await expect(download()).rejects.toMatchObject({ status: 302 })
    expect(buildSectionVisibilityFilter).toHaveBeenCalledWith(fakeDb, 1, 10)
    expect(settingsFindFirst).toHaveBeenCalledWith({
      where: { id: 5, congregationId: 10, section: VISIBLE_SECTIONS },
    })
  })

  it('refuses an id that the visibility filter does not surface', async () => {
    // The filter lives inside the query: a document in a section the viewer's roles do not
    // cover simply does not come back, exactly as on the board itself.
    settingsFindFirst.mockResolvedValue(null)

    await expect(download()).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it.each([
    [DynamicType.Organigram, { type: DynamicType.Organigram, tree: [] }],
    [DynamicType.PublisherGroups, { type: DynamicType.PublisherGroups, groups: [] }],
    [DynamicType.Pioneers, { type: DynamicType.Pioneers, pioneers: [] }],
    [DynamicType.Programme, { type: DynamicType.Programme, events: [], showServices: false, config: null }],
  ])('refuses an empty %s document rather than printing a blank page', async (dynamicType, data) => {
    settingsFindFirst.mockResolvedValue(documentSettings(dynamicType, 'Document'))
    getDynamicDocumentData.mockResolvedValue(data)

    await expect(download()).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('prints a configured programme with the board choices', async () => {
    const events = [meeting(1, '2026-10-18')]
    const config = { templates: [{ templateId: 3, parts: true, services: false }], groupBy: 'template' }
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Programme, 'Réunions'))
    getDynamicDocumentData.mockResolvedValue({ type: DynamicType.Programme, events, showServices: false, config })

    const response = await download()

    expect(response.status).toBe(200)
    expect(builtSheet().data).toMatchObject({ type: DynamicType.Programme, events, config })
    expect(builtSheet().options).toMatchObject({ title: 'Réunions', congregationName: 'Assemblée de Lyon' })
    expect(renderPdfResponse).toHaveBeenCalledWith(SHEET, 'réunions.pdf')
  })

  it('prints this month and the next of the programme, on the congregation’s clock', async () => {
    // 30 November 20:00 UTC is already 1 December in Nouméa (UTC+11): past the window.
    const events = [
      meeting(1, '2026-10-01'),
      meeting(2, '2026-11-29'),
      { ...meeting(3, '2026-11-30'), startDate: new Date('2026-11-30T20:00:00Z') },
    ]
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Programme, 'Réunions'))
    getDynamicDocumentData.mockResolvedValue({ type: DynamicType.Programme, events, showServices: false, config: null })

    await download()

    expect((builtSheet().data.events as { id: number }[]).map(event => event.id)).toEqual([1, 2])
    expect(builtSheet().options).toMatchObject({ timezone: 'Pacific/Noumea', asOf: NOW })
  })

  it('refuses a programme with nothing this month or the next rather than print a blank page', async () => {
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Programme, 'Réunions'))
    getDynamicDocumentData.mockResolvedValue({
      type: DynamicType.Programme,
      events: [meeting(1, '2027-02-10')],
      showServices: false,
      config: null,
    })

    await expect(download()).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('prints a deep-linked meeting even past the window', async () => {
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Programme, 'Réunions'))
    getDynamicDocumentData.mockResolvedValue({
      type: DynamicType.Programme,
      events: [meeting(41, '2026-10-20'), meeting(42, '2027-02-10')],
      showServices: false,
      config: null,
    })

    await download('?eventId=42')

    expect((builtSheet().data.events as { id: number }[]).map(event => event.id)).toEqual([42])
  })

  it('prints only the deep-linked event when the viewer was opened on one', async () => {
    // Notification emails open the viewer on a single event; its download button forwards the id
    // so the file matches what the reader is looking at.
    const events = [meeting(41, '2026-10-18'), meeting(42, '2026-10-21')]
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Programme, 'Réunions'))
    getDynamicDocumentData.mockResolvedValue({ type: DynamicType.Programme, events, showServices: false, config: null })

    await download('?eventId=42')

    expect(builtSheet().data.events).toEqual([events[1]])
  })

  it('prints the whole programme when the deep-linked event is not in it', async () => {
    const events = [meeting(41, '2026-10-18')]
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Programme, 'Réunions'))
    getDynamicDocumentData.mockResolvedValue({ type: DynamicType.Programme, events, showServices: false, config: null })

    await download('?eventId=99')

    expect(builtSheet().data.events).toEqual(events)
  })

  it('ignores a malformed event id, like the viewer', async () => {
    const events = [meeting(41, '2026-10-18')]
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Programme, 'Réunions'))
    getDynamicDocumentData.mockResolvedValue({ type: DynamicType.Programme, events, showServices: false, config: null })

    await download('?eventId=41abc')

    expect(builtSheet().data.events).toEqual(events)
  })

  it('names an untitled programme’s file after its type', async () => {
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Programme, ''))
    getDynamicDocumentData.mockResolvedValue({
      type: DynamicType.Programme,
      events: [meeting(1, '2026-10-18')],
      showServices: false,
      config: null,
    })

    await download()

    expect(renderPdfResponse).toHaveBeenCalledWith(SHEET, 'programme.pdf')
  })

  it('refuses a document whose data cannot be read, such as an unknown type', async () => {
    settingsFindFirst.mockResolvedValue(documentSettings('unknown-type', 'Document'))
    getDynamicDocumentData.mockResolvedValue(null)

    await expect(download()).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('reads the same data the viewer shows', async () => {
    settingsFindFirst.mockResolvedValue({
      ...documentSettings(DynamicType.PublisherGroups, 'Groupes'),
      dynamicRef: 'ref',
      showServices: true,
      dynamicConfig: { any: 'config' },
    })
    getDynamicDocumentData.mockResolvedValue({ type: DynamicType.PublisherGroups, groups: [{ id: 1 }] })

    await download()

    expect(getDynamicDocumentData).toHaveBeenCalledWith(fakeDb, DynamicType.PublisherGroups, 'ref', 10, {
      showServices: true,
      dynamicConfig: { any: 'config' },
    })
  })

  it.each([
    [DynamicType.Organigram, { type: DynamicType.Organigram, tree: [{ id: 1 }] }],
    [DynamicType.PublisherGroups, { type: DynamicType.PublisherGroups, groups: [{ id: 1 }] }],
    [DynamicType.Pioneers, { type: DynamicType.Pioneers, pioneers: [{ id: 1 }] }],
  ])('renders the %s sheet with its data, title and filename', async (dynamicType, data) => {
    settingsFindFirst.mockResolvedValue(documentSettings(dynamicType, 'Mon Document'))
    getDynamicDocumentData.mockResolvedValue(data)

    const response = await download()

    expect(response.status).toBe(200)
    expect(builtSheet().data).toEqual(data)
    expect(builtSheet().appearance).toEqual({ typeface: 'fira', accent: 'teal', layout: expect.any(String) })
    expect(builtSheet().options).toMatchObject({ title: 'Mon Document' })
    expect(renderPdfResponse).toHaveBeenCalledWith(SHEET, 'mon document.pdf')
  })

  it.each([
    [DynamicType.Organigram, { type: DynamicType.Organigram, tree: [{ id: 1 }] }, 'organigramme.pdf'],
    [DynamicType.PublisherGroups, { type: DynamicType.PublisherGroups, groups: [{ id: 1 }] }, 'groupes.pdf'],
    [DynamicType.Pioneers, { type: DynamicType.Pioneers, pioneers: [{ id: 1 }] }, 'pionniers.pdf'],
  ])('falls back to a per-type filename for a %s whose title sanitizes to nothing', async (type, data, expected) => {
    settingsFindFirst.mockResolvedValue(documentSettings(type, ''))
    getDynamicDocumentData.mockResolvedValue(data)

    await download()

    expect(renderPdfResponse).toHaveBeenCalledWith(expect.anything(), expected)
  })

  it('prints the congregation’s display name, not the raw provisioning name', async () => {
    // On managed hosting `Congregation.name` is the provisioning-time value; the name the
    // congregation actually chose lives in displayName, resolved by congregationContext.
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Organigram, 'Organigramme'))
    getDynamicDocumentData.mockResolvedValue({ type: DynamicType.Organigram, tree: [{ id: 1 }] })

    await download()

    expect(builtSheet().options.congregationName).toBe('Assemblée de Lyon')
  })
})
