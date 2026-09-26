import { beforeEach, describe, expect, it, vi } from 'vitest'

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

// The documents pull in @react-pdf/renderer and font files — irrelevant to the guards.
const OrganigramDocument = vi.fn()
const PublisherGroupsDocument = vi.fn()
const PioneersDocument = vi.fn()
const EventBoardDocument = vi.fn()
vi.mock('~/features/display-board/ui/dynamic/OrganigramDocument', () => ({ OrganigramDocument }))
vi.mock('~/features/display-board/ui/dynamic/PublisherGroupsDocument', () => ({ PublisherGroupsDocument }))
vi.mock('~/features/display-board/ui/dynamic/PioneersDocument', () => ({ PioneersDocument }))
vi.mock('~/features/events/index.server', () => ({ EventBoardDocument }))

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
    if (key === congregationContext) return { displayName: 'Assemblée de Lyon' }
    return { id: 1, congregationId: 10 }
  },
}

function download() {
  return loader({
    request: new Request('http://localhost/board/dynamic/5/pdf'),
    context,
    params: { dynamicId: '5' },
  } as never)
}

function documentSettings(dynamicType: string, title: string) {
  return { id: 5, dynamicType, dynamicRef: null, title, showServices: false, dynamicConfig: null }
}

function renderedElement(): { type: unknown; props: Record<string, unknown> } {
  return renderPdfResponse.mock.calls[0]?.[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  renderPdfResponse.mockReturnValue(new Response('%PDF', { status: 200 }))
  buildSectionVisibilityFilter.mockResolvedValue(VISIBLE_SECTIONS)
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

  it('prints a configured programme on the programmes export sheet, with the board choices', async () => {
    const events = [{ id: 1, templateId: 3 }]
    const config = { templates: [{ templateId: 3, parts: true, services: false }], groupBy: 'template' }
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Programme, 'Réunions'))
    getDynamicDocumentData.mockResolvedValue({ type: DynamicType.Programme, events, showServices: false, config })

    const response = await download()

    expect(response.status).toBe(200)
    expect(renderedElement().type).toBe(EventBoardDocument)
    expect(renderedElement().props).toMatchObject({
      events,
      groupBy: 'template',
      title: 'Réunions',
      congregationName: 'Assemblée de Lyon',
    })
    expect((renderedElement().props.configMap as Map<number, unknown>).get(3)).toEqual({ parts: true, services: false })
    expect(renderPdfResponse).toHaveBeenCalledWith(expect.anything(), 'réunions.pdf')
  })

  it('keeps services off for a legacy programme that hides them on the board', async () => {
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Programme, ''))
    getDynamicDocumentData.mockResolvedValue({
      type: DynamicType.Programme,
      events: [{ id: 1, templateId: 9 }],
      showServices: false,
      config: null,
    })

    await download()

    expect((renderedElement().props.configMap as Map<number, unknown>).get(9)).toEqual({ parts: true, services: false })
    expect(renderPdfResponse).toHaveBeenCalledWith(expect.anything(), 'programme.pdf')
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
    [DynamicType.Organigram, { type: DynamicType.Organigram, tree: [{ id: 1 }] }, OrganigramDocument, 'tree'],
    [
      DynamicType.PublisherGroups,
      { type: DynamicType.PublisherGroups, groups: [{ id: 1 }] },
      PublisherGroupsDocument,
      'groups',
    ],
    [DynamicType.Pioneers, { type: DynamicType.Pioneers, pioneers: [{ id: 1 }] }, PioneersDocument, 'pioneers'],
  ])('renders the %s sheet with its data, title and filename', async (dynamicType, data, component, dataKey) => {
    settingsFindFirst.mockResolvedValue(documentSettings(dynamicType, 'Mon Document'))
    getDynamicDocumentData.mockResolvedValue(data)

    const response = await download()

    expect(response.status).toBe(200)
    expect(renderedElement().type).toBe(component)
    expect(renderedElement().props).toMatchObject({
      [dataKey]: data[dataKey as keyof typeof data],
      title: 'Mon Document',
    })
    expect(renderPdfResponse).toHaveBeenCalledWith(expect.anything(), 'mon document.pdf')
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

    expect(renderedElement().props.congregationName).toBe('Assemblée de Lyon')
  })
})
