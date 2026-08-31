import { beforeEach, describe, expect, it, vi } from 'vitest'

// The PDF URL is guessable, so the loader must be guarded exactly like the viewer: the section
// visibility filter in the query, plus a type guard — an id pointing at a programme document
// must not render anything, organigram or otherwise.

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

// The component pulls in @react-pdf/renderer and font files — irrelevant to the guards.
vi.mock('~/features/display-board/ui/dynamic/OrganigramDocument', () => ({ OrganigramDocument: vi.fn() }))
vi.mock('~/features/display-board/server/organigram-document.server', () => ({
  fetchOrganigramDocument: vi.fn().mockResolvedValue([]),
}))
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

beforeEach(() => {
  vi.clearAllMocks()
  renderPdfResponse.mockReturnValue(new Response('%PDF', { status: 200 }))
})

describe('the organigram PDF loader', () => {
  it('refuses an id that the visibility filter does not surface', async () => {
    // The filter lives inside the query: a document in a section the viewer's roles do not
    // cover simply does not come back, exactly as on the board itself.
    settingsFindFirst.mockResolvedValue(null)

    await expect(download()).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('refuses a document of another dynamic type', async () => {
    settingsFindFirst.mockResolvedValue({ id: 5, dynamicType: DynamicType.Programme, title: 'Programme' })

    await expect(download()).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('renders the PDF for a visible organigram document', async () => {
    settingsFindFirst.mockResolvedValue({ id: 5, dynamicType: DynamicType.Organigram, title: 'Organigramme' })

    const response = await download()

    expect(response.status).toBe(200)
    expect(renderPdfResponse).toHaveBeenCalledWith(expect.anything(), 'organigramme.pdf')
  })

  it('prints the congregation’s display name, not the raw provisioning name', async () => {
    // On managed hosting `Congregation.name` is the provisioning-time value; the name the
    // congregation actually chose lives in displayName, resolved by congregationContext.
    settingsFindFirst.mockResolvedValue({ id: 5, dynamicType: DynamicType.Organigram, title: 'Organigramme' })

    await download()

    const element = renderPdfResponse.mock.calls[0]?.[0] as { props: { congregationName: string } }
    expect(element.props.congregationName).toBe('Assemblée de Lyon')
  })
})
