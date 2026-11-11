import { beforeEach, describe, expect, it, vi } from 'vitest'

// « Notre liste » as a PDF. The URL is guessable, so the loader is guarded like the page: whoever may see the visiting
// speakers. It refuses a list nobody is on — the page hides its download button for it — rather than print a blank page.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')
const congregationContext = Symbol('congregationContext')
vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  congregationContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn({}, 10),
}))

const getOurSpeakerListPage = vi.fn()
vi.mock('~/features/events/server/our-speakers.queries', () => ({ getOurSpeakerListPage }))
// The document pulls in @react-pdf/renderer and font files — irrelevant to the guards.
const renderOurSpeakerListPdf = vi.fn()
vi.mock('~/features/events/server/our-speaker-list-pdf.server', () => ({ renderOurSpeakerListPdf }))
vi.mock('~/shared/infra/logger.server', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const { Permission } = await import('~/shared/types/permission')
const { loader } = await import('./ours-pdf')

let granted: Set<string>
const context = {
  get: (key: symbol) => {
    if (key === permissionsContext) return granted
    if (key === congregationContext) return { displayName: 'Les Lilas', timezone: 'Europe/Paris', locale: 'fr' }
    return { id: 1, congregationId: 10 }
  },
}

const download = (search = '') =>
  loader({ request: new Request(`http://localhost/programs/external-speakers/ours/pdf${search}`), context } as never)

const onList = (value: boolean) => ({ brothers: [{ memberId: 2, onList: value }] })

beforeEach(() => {
  vi.clearAllMocks()
  granted = new Set([Permission.CanViewExternalSpeakers])
  getOurSpeakerListPage.mockResolvedValue(onList(true))
  renderOurSpeakerListPdf.mockResolvedValue({
    filename: 'orateurs les lilas 2026-11-11.pdf',
    content: Buffer.from('%PDF'),
    count: 1,
  })
})

describe('the « Notre liste » PDF', () => {
  it('turns away an account that may not see the visiting speakers, before reading anything', async () => {
    granted = new Set([Permission.CanViewPrograms])

    await expect(download()).rejects.toMatchObject({ status: 302 })
    expect(getOurSpeakerListPage).not.toHaveBeenCalled()
    expect(renderOurSpeakerListPdf).not.toHaveBeenCalled()
  })

  it('sends a list nobody is on back to the page instead of printing a blank sheet', async () => {
    getOurSpeakerListPage.mockResolvedValue(onList(false))

    await expect(download()).rejects.toMatchObject({ status: 302 })
    expect(renderOurSpeakerListPdf).not.toHaveBeenCalled()
  })

  it('downloads the list, in the congregation’s language, named after it and the day', async () => {
    const response = await download()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="orateurs les lilas 2026-11-11.pdf"')
    expect(renderOurSpeakerListPdf.mock.calls[0]?.[1]).toMatchObject({ congregationName: 'Les Lilas', locale: 'fr' })
  })

  it('opens in the browser for the send dialog’s « Aperçu »', async () => {
    const response = await download('?preview')

    expect(response.headers.get('Content-Disposition')).toBe('inline; filename="orateurs les lilas 2026-11-11.pdf"')
  })
})
