import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The S-21 route is the one place a caller picks the service year by URL. The year has to
// reach the query, the document and the filename together, and a malformed value must not be
// quietly swapped for the current year — the sheet is filed as an official record.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')
const congregationContext = Symbol('congregationContext')

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  congregationContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn({}),
}))

const renderPdfResponse = vi.fn()
vi.mock('~/shared/infra/pdf.server', () => ({
  renderPdfResponse,
  sanitizeFilename: (name: string) => name,
}))

const getPublisherById = vi.fn()
vi.mock('~/features/publishers/server/publishers.server', () => ({ getPublisherById }))

vi.mock('~/features/publishers/ui/PublisherActivityDocument', () => ({ PublisherActivityDocument: vi.fn(() => null) }))
vi.mock('~/shared/infra/logger.server', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const { Permission } = await import('~/shared/types/permission')
const { loader } = await import('./activity-pdf')

function buildContext(options: { timezone?: string; permissions?: Set<string> } = {}) {
  return {
    get: (key: symbol) => {
      if (key === permissionsContext) return options.permissions ?? new Set([Permission.CanRecordActivity])
      if (key === congregationContext) return { timezone: options.timezone ?? 'Europe/Paris' }
      return { id: 1, congregationId: 10 }
    },
  }
}

function download(search = '', context = buildContext()) {
  return loader({
    request: new Request(`http://localhost/publishers/5/activity/pdf${search}`),
    context,
    params: { publisherId: '5' },
  } as never)
}

function renderedElement(): { props: Record<string, unknown> } {
  return renderPdfResponse.mock.calls[0][0]
}

beforeEach(() => {
  vi.clearAllMocks()
  getPublisherById.mockResolvedValue({ id: 5, firstname: 'Aubeline', lastname: 'Martin', activities: [] })
  renderPdfResponse.mockImplementation(
    (_element: unknown, filename: string) =>
      new Response('%PDF', { status: 200, headers: { 'Content-Disposition': `attachment; filename="${filename}"` } }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the S-21 loader', () => {
  it('prints the service year given in the URL: query, sheet and filename agree', async () => {
    const response = await download('?year=2024')

    expect(getPublisherById.mock.calls[0][3]).toBe(2024)
    expect(renderedElement().props).toMatchObject({ serviceYear: 2024 })
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="S-21_F-Aubeline-Martin-2024.pdf"')
  })

  it('defaults to the current service year in the congregation timezone', async () => {
    // Already 1 September in Paris, still 31 August in Los Angeles: a new service year in Paris only.
    vi.useFakeTimers({ now: new Date('2026-09-01T03:00:00Z') })

    await download('', buildContext({ timezone: 'Europe/Paris' }))
    expect(renderedElement().props).toMatchObject({ serviceYear: 2026 })

    vi.clearAllMocks()
    await download('', buildContext({ timezone: 'America/Los_Angeles' }))
    expect(renderedElement().props).toMatchObject({ serviceYear: 2025 })
  })

  it('refuses a malformed year instead of printing another one', async () => {
    for (const year of ['2O24', '2024.5', '99999', '-1']) {
      await expect(async () => download(`?year=${year}`)).rejects.toMatchObject({ status: 302 })
    }

    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('refuses a user without the record-activity permission', async () => {
    await expect(async () => download('?year=2024', buildContext({ permissions: new Set() }))).rejects.toMatchObject({
      status: 302,
    })

    expect(getPublisherById).not.toHaveBeenCalled()
  })
})
