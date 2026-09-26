import { beforeEach, describe, expect, it, vi } from 'vitest'

// The PDF URL is guessable, so the loader must be guarded exactly like the viewer: the section
// visibility filter in the query. It reads the same data as the viewer, and refuses a document
// that would print as a blank page — the viewer hides its button for exactly those.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')
const congregationContext = Symbol('congregationContext')

const settingsFindFirst = vi.fn()
const fakeDb = {
  boardDynamicDocumentSettings: { findFirst: settingsFindFirst },
}

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  congregationContext,
  requirePermission: vi.fn(),
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
vi.mock('~/features/display-board/ui/dynamic/OrganigramDocument', () => ({ OrganigramDocument }))
vi.mock('~/features/display-board/ui/dynamic/PublisherGroupsDocument', () => ({ PublisherGroupsDocument }))
vi.mock('~/features/display-board/ui/dynamic/PioneersDocument', () => ({ PioneersDocument }))

const getDynamicDocumentData = vi.fn()
vi.mock('~/features/display-board/server/dynamic-documents.server', () => ({ getDynamicDocumentData }))
vi.mock('~/features/display-board/server/section-visibility.server', () => ({
  buildSectionVisibilityFilter: vi.fn().mockResolvedValue({}),
}))

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
})

describe('the dynamic document PDF loader', () => {
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
  ])('refuses an empty %s document rather than printing a blank page', async (dynamicType, data) => {
    settingsFindFirst.mockResolvedValue(documentSettings(dynamicType, 'Document'))
    getDynamicDocumentData.mockResolvedValue(data)

    await expect(download()).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('refuses a programme, which has no printable sheet yet', async () => {
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Programme, 'Programme'))
    getDynamicDocumentData.mockResolvedValue({ type: DynamicType.Programme, events: [{ id: 1 }] })

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

  it('falls back to a per-type filename when the title sanitizes to nothing', async () => {
    settingsFindFirst.mockResolvedValue(documentSettings(DynamicType.Pioneers, ''))
    getDynamicDocumentData.mockResolvedValue({ type: DynamicType.Pioneers, pioneers: [{ id: 1 }] })

    await download()

    expect(renderPdfResponse).toHaveBeenCalledWith(expect.anything(), 'pionniers.pdf')
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
