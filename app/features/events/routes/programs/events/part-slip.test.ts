import { beforeEach, describe, expect, it, vi } from 'vitest'

// The S-89 slip of one part. The guards mirror the event page: the reader may see the programme, may fill its parts,
// the programme is published, and the part is a student's. Anything else is a redirect and no document.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')
const congregationContext = Symbol('congregationContext')

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  congregationContext,
  requirePermission: (permissions: Set<string>, permission: string) => {
    if (!permissions.has(permission)) throw new Response(null, { status: 302, headers: { Location: '/' } })
  },
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn({}),
}))

const getEventProgramme = vi.fn()
vi.mock('~/features/events/server/event-part-assignments.server', () => ({ getEventProgramme }))

const canChangeEvent = vi.fn()
const canPublishEvent = vi.fn()
const canFillSchedule = vi.fn()
// Opening asks the same of the duties as filling them here: one duties schedule.
vi.mock('~/features/events/server/schedule-rights.server', () => ({
  canChangeEvent,
  canPublishEvent,
  canFillSchedule,
  canFillSomeSchedule: canFillSchedule,
}))

const renderPdfResponse = vi.fn()
vi.mock('~/shared/infra/pdf.server', () => ({ renderPdfResponse, sanitizeFilename: (name: string) => name }))
vi.mock('~/features/events/ui/pdf/StudentSlipDocument', () => ({ StudentSlipDocument: vi.fn(() => null) }))
vi.mock('~/shared/domain/demo-mode.server', () => ({ isDemoCongregation: () => false }))

const { Permission } = await import('~/shared/types/permission')
const m = await import('~/i18n/paraglide/messages')
const { loader } = await import('./part-slip')

const EVENT_ID = 5
const PART_ID = 42

function part(overrides: Record<string, unknown> = {}) {
  return {
    id: PART_ID,
    name: 'Lecture de la Bible',
    section: 'Trésors',
    order: 4,
    track: '',
    trackOrder: null,
    assigneeId: 9,
    assignee: { firstname: 'Marc', lastname: 'Dupont' },
    assistant: null,
    externalSpeaker: null,
    preset: { key: 'bible-reading', printsStudentSlip: true },
    ...overrides,
  }
}

function programme(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EVENT_ID,
    status: 'released',
    startDate: new Date('2026-11-10T18:00:00Z'),
    template: { attendanceKind: 'midweek' },
    schedules: [{ kind: 'programme', status: 'published' }],
    eventParts: [part()],
    ...overrides,
  }
}

function download(
  event: ReturnType<typeof programme> | null,
  partId = PART_ID,
  permissions = new Set([Permission.CanViewPrograms]),
) {
  getEventProgramme.mockResolvedValue(event)
  return loader({
    params: { eventId: String(EVENT_ID), partId: String(partId) },
    context: {
      get: (key: symbol) => {
        if (key === permissionsContext) return permissions
        if (key === congregationContext) return { timezone: 'Europe/Paris' }
        return { id: 1, congregationId: 10 }
      },
    },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  canChangeEvent.mockResolvedValue(false)
  canPublishEvent.mockResolvedValue(false)
  canFillSchedule.mockResolvedValue(true)
  renderPdfResponse.mockImplementation(
    (_element: unknown, filename: string) =>
      new Response('%PDF', { status: 200, headers: { 'Content-Disposition': `attachment; filename="${filename}"` } }),
  )
})

describe('the S-89 slip loader', () => {
  it('prints the slip of a student part, named after the student', async () => {
    const response = await download(programme())

    expect(renderPdfResponse).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="${m.slip_pdf_filename()}-Marc Dupont.pdf"`,
    )
  })

  it('refuses a reader who may not see the programme', async () => {
    await expect(async () => download(programme(), PART_ID, new Set())).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('refuses a reader who may not fill the programme', async () => {
    canFillSchedule.mockResolvedValue(false)
    await expect(async () => download(programme())).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('refuses a programme still in draft', async () => {
    const draft = programme({ schedules: [{ kind: 'programme', status: 'draft' }] })
    await expect(async () => download(draft)).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('refuses a part that is not a student’s, an external speaker’s, or not in this programme', async () => {
    const prayer = programme({ eventParts: [part({ preset: { key: 'prayer', printsStudentSlip: false } })] })
    const external = programme({ eventParts: [part({ externalSpeaker: { id: 3 } })] })

    await expect(async () => download(prayer)).rejects.toMatchObject({ status: 302 })
    await expect(async () => download(external)).rejects.toMatchObject({ status: 302 })
    await expect(async () => download(programme(), 999)).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('refuses an event that does not exist', async () => {
    await expect(async () => download(null)).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })
})
