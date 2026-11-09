import { beforeEach, describe, expect, it, vi } from 'vitest'

// The report panel's data route. A group's overseer reads and saves his own group's reports only, never sees or sets
// the credit, and never deletes; the secretary does all of it. Reports live in an in-memory store, so the tests
// assert on what was read and written.

interface StoredReport {
  id: number
  publisherId: number
  month: number
  year: number
  type: string
  hours: number
  creditHours: number | null
}

const { reports, enrolments } = vi.hoisted(() => ({
  reports: new Map<number, StoredReport>(),
  enrolments: new Map<number, { type: string; goal: number }>(),
}))

const PUBLISHERS = new Map([
  [41, { id: 41, firstname: 'Own', lastname: 'Group', groupId: 9, groupName: 'Sud' }],
  [42, { id: 42, firstname: 'Other', lastname: 'Group', groupId: 4, groupName: 'Nord' }],
])

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn({}, 1),
}))
vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(() => ({ flash: vi.fn() })),
  commitSession: vi.fn(() => '__session=committed'),
}))
vi.mock('~/features/publishers/server/report-panel.queries', () => ({
  getReportPanelData: vi.fn(
    (_db: unknown, _c: number, { publisherId, month, year }: { publisherId: number; month: number; year: number }) => {
      const publisher = PUBLISHERS.get(publisherId)
      if (!publisher) return null
      const report = [...reports.values()].find(
        r => r.publisherId === publisherId && r.month === month && r.year === year,
      )
      return {
        publisher,
        month,
        year,
        report: report ? { ...report, studies: 0, isPublisher: true, notes: '' } : null,
        enrolment: enrolments.get(publisherId) ?? null,
        rates: { PionnierAuxiliaires: 30 },
      }
    },
  ),
}))
vi.mock('~/features/publishers/server/publisher-activity-mutations.server', () => ({
  createPublisherActivity: vi.fn(
    (_db: unknown, input: Omit<StoredReport, 'id' | 'creditHours'> & { creditHours?: number | null }) => {
      const id = reports.size + 100
      reports.set(id, { ...input, id, creditHours: input.creditHours ?? null })
    },
  ),
  updatePublisherActivity: vi.fn((_db: unknown, id: number, _c: number, _a: number, input: Partial<StoredReport>) => {
    const row = reports.get(id)
    if (row) reports.set(id, { ...row, ...input })
  }),
  deletePublisherActivity: vi.fn((_db: unknown, id: number) => reports.delete(id)),
}))

const { formRequest, routeContext } = await import('~/tests/helpers/route-action')
const { Permission } = await import('~/shared/types/permission')
const route = await import('./report')

type Caller = Parameters<typeof routeContext>

// The overseer of group 9, holding no activity permission.
const OVERSEER: Caller = [[], { member: { id: 3, publisherGroupId: 9, responsibleFor: { id: 9 }, deputyFor: null } }]
const SECRETARY: Caller = [[Permission.CanViewActivity, Permission.CanRecordActivity, Permission.CanCorrectActivity]]
const RECORDER: Caller = [[Permission.CanViewActivity, Permission.CanRecordActivity]]

/** A route result as status and body: `data()` wraps both, a plain object is a 200. */
async function settle(run: () => unknown) {
  const result = (await run()) as { type?: string; data?: unknown; init?: { status?: number } | null }
  if (result?.type === 'DataWithResponseInit') {
    return { status: result.init?.status ?? 200, body: result.data as Record<string, unknown> }
  }
  return { status: 200, body: result as Record<string, unknown> }
}

function open(publisherId: number, caller: Caller) {
  return settle(() =>
    route.loader({
      request: new Request(
        `https://unitae.example.test/publishers/activity/report?publisherId=${publisherId}&month=9&year=2026`,
      ),
      params: {},
      context: routeContext(...caller),
    } as never),
  )
}

function submit(caller: Caller, fields: Record<string, string>) {
  return settle(() =>
    route.action({
      request: formRequest('https://unitae.example.test/publishers/activity/report', {
        intent: 'save',
        month: '9',
        year: '2026',
        ...fields,
      }),
      params: {},
      context: routeContext(...caller),
    } as never),
  )
}

const reportOf = (publisherId: number) => [...reports.values()].find(r => r.publisherId === publisherId)

beforeEach(() => {
  reports.clear()
  enrolments.clear()
})

describe('the report panel for a group overseer', () => {
  it("opens and files a report for his own group's publisher", async () => {
    expect((await open(41, OVERSEER)).status).toBe(200)

    await submit(OVERSEER, { publisherId: '41', hours: '0', preached: 'on', studies: '1' })

    expect(reportOf(41)).toMatchObject({ type: 'Normal', hours: 0 })
  })

  it("refuses another group's publisher, to read and to save", async () => {
    expect(await open(42, OVERSEER)).toEqual({ status: 403, body: { ok: false, reason: 'forbidden' } })

    const saved = await submit(OVERSEER, { publisherId: '42', hours: '12' })

    expect(saved.status).toBe(403)
    expect(reportOf(42)).toBeUndefined()
  })

  it('never sees the credit, and a crafted one is ignored on create and on update', async () => {
    enrolments.set(41, { type: 'PionnierPermanant', goal: 50 })
    await submit(OVERSEER, { publisherId: '41', hours: '42', creditHours: '999' })
    expect(reportOf(41)?.creditHours).toBeNull()

    const id = reportOf(41)?.id ?? 0
    reports.set(id, { ...(reports.get(id) as StoredReport), creditHours: 8 })
    const panel = await open(41, OVERSEER)
    expect((panel.body.report as StoredReport).creditHours).toBeNull()
    expect(panel.body.canGrantCredit).toBe(false)

    await submit(OVERSEER, { publisherId: '41', hours: '44', creditHours: '' })
    expect(reportOf(41)).toMatchObject({ hours: 44, creditHours: 8 })
  })

  it('cannot delete a report', async () => {
    reports.set(1, { id: 1, publisherId: 41, month: 9, year: 2026, type: 'Normal', hours: 0, creditHours: null })

    expect((await open(41, OVERSEER)).body.canDelete).toBe(false)
    const deleted = await submit(OVERSEER, { intent: 'delete', publisherId: '41' })

    expect(deleted.status).toBe(403)
    expect(reports.has(1)).toBe(true)
  })
})

describe('the report panel for the secretary', () => {
  it('grants a credit with a new report, and clears it when emptied', async () => {
    enrolments.set(42, { type: 'PionnierPermanant', goal: 50 })

    await submit(SECRETARY, { publisherId: '42', hours: '42', creditHours: '8' })
    expect(reportOf(42)).toMatchObject({ type: 'PionnierPermanant', hours: 42, creditHours: 8 })

    await submit(SECRETARY, { publisherId: '42', hours: '42', creditHours: '' })
    expect(reportOf(42)?.creditHours).toBeNull()
  })

  it('records no credit on a « Normal » month', async () => {
    await submit(SECRETARY, { publisherId: '42', hours: '0', preached: 'on', creditHours: '5' })
    expect(reportOf(42)?.creditHours).toBeNull()
  })

  it('deletes a filed report', async () => {
    reports.set(1, { id: 1, publisherId: 42, month: 9, year: 2026, type: 'Normal', hours: 0, creditHours: null })

    expect((await open(42, SECRETARY)).body.canDelete).toBe(true)
    await submit(SECRETARY, { intent: 'delete', publisherId: '42' })

    expect(reports.has(1)).toBe(false)
  })
})

describe('the report panel for a recorder', () => {
  it('files a missing report but cannot open a filed one', async () => {
    await submit(RECORDER, { publisherId: '42', hours: '0', preached: 'on' })
    expect(reportOf(42)).toBeDefined()

    expect((await open(42, RECORDER)).status).toBe(403)
    const corrected = await submit(RECORDER, { publisherId: '42', hours: '0' })
    expect(corrected.status).toBe(403)
  })
})

describe('the type a report records', () => {
  it('takes the enrolment covering the month, whatever was submitted', async () => {
    enrolments.set(42, { type: 'PionnierPermanant', goal: 50 })
    await submit(SECRETARY, { publisherId: '42', type: 'Normal', hours: '50' })
    expect(reportOf(42)?.type).toBe('PionnierPermanant')
  })

  it('records an auxiliary month taken without an enrolment', async () => {
    await submit(SECRETARY, { publisherId: '42', type: 'PionnierAuxiliaires', hours: '31' })
    expect(reportOf(42)?.type).toBe('PionnierAuxiliaires')
  })
})
