import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

const permissionsContext = Symbol('permissions')
const currentAccountContext = Symbol('account')
const congregationContext = Symbol('congregation')
vi.mock('~/shared/auth/route-context.server', () => ({
  permissionsContext,
  currentAccountContext,
  congregationContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn({}),
}))
const getBranchReport = vi.fn()
vi.mock('~/features/publishers/index.server', () => ({
  getBranchReport: (...args: unknown[]) => getBranchReport(...args),
}))
const listServiceYearAttendance = vi.fn()
vi.mock('~/features/events/server/attendance.queries', () => ({
  listServiceYearAttendance: (...args: unknown[]) => listServiceYearAttendance(...args),
}))
const renderPdfResponse = vi.fn()
vi.mock('~/shared/infra/pdf.server', () => ({ renderPdfResponse: (...args: unknown[]) => renderPdfResponse(...args) }))
vi.mock('~/features/events/ui/pdf/BranchReportDocument', () => ({ BranchReportDocument: vi.fn() }))

const { loader } = await import('./branch-report-pdf')

const BRANCH = {
  publishers: { reports: 30, studies: 9 },
  auxiliary: { reports: 3, hours: 95, studies: 4 },
  regular: { reports: 5, hours: 317, studies: 8 },
  congregation: { reports: 40, hours: 412, studies: 21, irregular: 2 },
}

function contextWith(permissions: Permission[]) {
  const values = new Map<symbol, unknown>([
    [permissionsContext, new Set(permissions)],
    [currentAccountContext, { id: 9, congregationId: 3 }],
    [congregationContext, { timezone: 'Europe/Paris', name: 'lilas', displayName: 'Les Lilas', slug: 'lilas' }],
  ])
  return { get: (key: symbol) => values.get(key) } as never
}
const args = (search: string, permissions: Permission[]) =>
  ({
    request: new Request(`http://localhost/attendance/branch-report.pdf${search}`),
    context: contextWith(permissions),
  }) as never

// A complete weekend meeting of October 2026, and one of September that must not count.
const weekend = (iso: string, inPerson: number) => ({
  eventId: 1,
  name: 'Week-end',
  startDate: new Date(iso),
  day: iso.slice(0, 10),
  kind: 'weekend',
  templateId: 2,
  inPerson,
  online: 10,
})

beforeEach(() => {
  vi.resetAllMocks()
  getBranchReport.mockResolvedValue({ branch: BRANCH, activePublishers: 44, secretary: 'Paul MARTIN' })
  listServiceYearAttendance.mockResolvedValue([
    weekend('2026-10-11T08:00:00Z', 90),
    weekend('2026-09-13T08:00:00Z', 50),
  ])
  renderPdfResponse.mockResolvedValue(new Response('pdf', { status: 200 }))
})

describe('the S-1 PDF', () => {
  // The same right as the activity page and its other exports: the file is its figures.
  it('refuses whoever may not view the activity, and renders nothing', async () => {
    await expect(loader(args('?month=9&year=2026', [Permission.CanViewAttendance]))).rejects.toMatchObject({
      status: 302,
    })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it('sends a month that does not parse back to the activity page', async () => {
    const reader = [Permission.CanViewActivity]
    await expect(loader(args('?month=12&year=2026', reader))).rejects.toMatchObject({ status: 302 })
    await expect(loader(args('?month=abc&year=2026', reader))).rejects.toMatchObject({ status: 302 })
    // An empty value is not January.
    await expect(loader(args('?month=&year=2026', reader))).rejects.toMatchObject({ status: 302 })
    await expect(loader(args('?month=0&year=', reader))).rejects.toMatchObject({ status: 302 })
    expect(renderPdfResponse).not.toHaveBeenCalled()
  })

  it("fills in the month's figures and its weekend average, for a reader of both", async () => {
    const response = await loader(
      args('?month=9&year=2026', [Permission.CanViewActivity, Permission.CanViewAttendance]),
    )

    expect(response.status).toBe(200)
    expect(getBranchReport).toHaveBeenCalledWith({}, { congregationId: 3, month: 9, year: 2026 })
    const [[document, filename]] = renderPdfResponse.mock.calls
    expect(filename).toBe('S-1_2026-10.pdf')
    expect(document.props).toMatchObject({
      congregationName: 'Les Lilas',
      month: 9,
      year: 2026,
      publishers: BRANCH.publishers,
      auxiliary: BRANCH.auxiliary,
      regular: BRANCH.regular,
      activePublishers: 44,
      weekendAverage: 100,
      secretary: 'Paul MARTIN',
    })
  })

  it('leaves the weekend average blank for a reader who may not see attendance', async () => {
    await loader(args('?month=9&year=2026', [Permission.CanViewActivity]))

    expect(listServiceYearAttendance).not.toHaveBeenCalled()
    const [[document]] = renderPdfResponse.mock.calls
    expect(document.props.weekendAverage).toBeNull()
  })

  // January belongs to the service year that began the September before, read in the congregation's zone.
  it('reads the attendance of the service year a January belongs to, in the congregation’s zone', async () => {
    listServiceYearAttendance.mockResolvedValue([weekend('2027-01-10T08:00:00Z', 70)])

    const response = await loader(
      args('?month=0&year=2027', [Permission.CanViewActivity, Permission.CanViewAttendance]),
    )

    expect(response.status).toBe(200)
    expect(listServiceYearAttendance).toHaveBeenCalledWith(
      {},
      { congregationId: 3, serviceYear: 2026, timeZone: 'Europe/Paris' },
    )
    const [[document, filename]] = renderPdfResponse.mock.calls
    expect(filename).toBe('S-1_2027-01.pdf')
    expect(document.props.weekendAverage).toBe(80)
  })
})
