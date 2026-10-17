import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'
import { PublisherType } from '~/shared/types/publisher-type'

// A report's pioneer type comes from the enrolment covering its month: the form shows that
// enrolment instead of asking, and the actions save it whatever the request says. Without an
// enrolment for the month the publisher was not a pioneer that month, even if a stint starts
// later, so the submitted choice (publisher, or an auxiliary month without an enrolment) stands.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')

const createPublisherActivity = vi.fn()
const updatePublisherActivity = vi.fn()
const getEnrolmentsForMember = vi.fn()
const memberFindUnique = vi.fn()
const activityFindUnique = vi.fn()

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) =>
    fn({ member: { findUnique: memberFindUnique }, publisherActivity: { findUnique: activityFindUnique } }),
}))

vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn().mockResolvedValue({ flash: vi.fn() }),
  commitSession: vi.fn().mockResolvedValue('cookie'),
}))

// The member's stints for the current test; getMonthEnrolment applies the real month rule to them.
vi.mock('~/features/publishers/index.server', async () => {
  const { enrolmentForMonth } = await import('~/features/publishers/model/pioneer-enrolment')
  return {
    getMonthEnrolment: async (_db: unknown, memberId: number, congregationId: number, month: number, year: number) => {
      const enrolment = enrolmentForMonth(await getEnrolmentsForMember(memberId, congregationId), month, year)
      return enrolment == null ? null : { type: enrolment.type, goal: 30 }
    },
  }
})

vi.mock('~/features/publishers/server/publisher-activity-mutations.server', () => ({
  createPublisherActivity,
  updatePublisherActivity,
}))

vi.mock('~/features/publishers/server/publishers.server', () => ({ getPublishers: vi.fn() }))

const { action: createAction } = await import('./new')
const { action: editAction } = await import('./edit')

const SECRETARY = new Set([Permission.CanManagePublishers, Permission.CanCorrectActivity])

function context() {
  return {
    get: (key: symbol) => (key === permissionsContext ? SECRETARY : { id: 1, congregationId: 10, member: null }),
  }
}

function form(fields: Record<string, string>) {
  const body = new FormData()
  body.set('hours', '12')
  body.set('studies', '0')
  body.set('observations', '')
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  return body
}

// September 2026 is month 8.
const AUXILIARY_SEPTEMBER = {
  type: PublisherType.PionnierAuxiliaires,
  startMonth: 8,
  startYear: 2026,
  endMonth: 8,
  endYear: 2026,
  monthlyGoal: null,
}
const PERMANENT_FROM_OCTOBER = {
  type: PublisherType.PionnierPermanant,
  startMonth: 9,
  startYear: 2026,
  endMonth: null,
  endYear: null,
  monthlyGoal: null,
}

function savedType(mock: ReturnType<typeof vi.fn>) {
  const call = mock.mock.calls[0]
  const input = call[call.length - 1] as { type: PublisherType }
  return input.type
}

beforeEach(() => {
  vi.clearAllMocks()
  memberFindUnique.mockResolvedValue({ id: 7, firstname: 'D', lastname: 'B' })
  activityFindUnique.mockResolvedValue({
    id: 9,
    month: 8,
    year: 2026,
    publisher: { id: 7, firstname: 'D', lastname: 'B' },
  })
  createPublisherActivity.mockResolvedValue({ id: 9, month: 8, year: 2026 })
  updatePublisherActivity.mockResolvedValue({ id: 9 })
})

async function create(fields: Record<string, string>) {
  await createAction({
    request: new Request('http://localhost/publishers/activity/new', {
      method: 'POST',
      body: form({ publisher: '7', month: '8', year: '2026', ...fields }),
    }),
    context: context(),
  } as never).catch((thrown: unknown) => {
    if (!(thrown instanceof Response)) throw thrown
  })
}

async function edit(fields: Record<string, string>) {
  await editAction({
    params: { activityId: '9' },
    request: new Request('http://localhost/publishers/activity/9/edit', { method: 'POST', body: form(fields) }),
    context: context(),
  } as never).catch((thrown: unknown) => {
    if (!(thrown instanceof Response)) throw thrown
  })
}

describe('a new report', () => {
  it('records the enrolled type for an enrolled month, whatever was submitted', async () => {
    getEnrolmentsForMember.mockResolvedValue([AUXILIARY_SEPTEMBER])
    await create({ type: PublisherType.Normal })
    expect(savedType(createPublisherActivity)).toBe(PublisherType.PionnierAuxiliaires)
  })

  // Regression: the standing status of a stint starting in October stamped September's report.
  it('does not take the type of a stint that starts after the month', async () => {
    getEnrolmentsForMember.mockResolvedValue([PERMANENT_FROM_OCTOBER])
    await create({})
    expect(savedType(createPublisherActivity)).toBe(PublisherType.Normal)
  })

  it('records an auxiliary month taken without an enrolment', async () => {
    getEnrolmentsForMember.mockResolvedValue([])
    await create({ type: PublisherType.PionnierAuxiliaires })
    expect(savedType(createPublisherActivity)).toBe(PublisherType.PionnierAuxiliaires)
  })
})

describe('an edited report', () => {
  // Regression: the edit form offered every type and saved the choice, even for an enrolled month.
  it('keeps the enrolled type for an enrolled month, whatever was submitted', async () => {
    getEnrolmentsForMember.mockResolvedValue([AUXILIARY_SEPTEMBER])
    await edit({ type: PublisherType.Normal })
    expect(savedType(updatePublisherActivity)).toBe(PublisherType.PionnierAuxiliaires)
  })

  it('records the submitted type for a month no enrolment covers', async () => {
    getEnrolmentsForMember.mockResolvedValue([])
    await edit({ type: PublisherType.PionnierSpecial })
    expect(savedType(updatePublisherActivity)).toBe(PublisherType.PionnierSpecial)
  })
})
