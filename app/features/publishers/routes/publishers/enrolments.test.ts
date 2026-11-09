import { beforeEach, describe, expect, it, vi } from 'vitest'

// The record's pioneer-enrolment action. A publisher manager enrols, corrects, stops and removes the stints of the
// publisher in the address, and only theirs. Stints live in an in-memory store, so the tests assert on what was
// written; the workflow functions stand in for the aggregate.

interface StoredEnrolment {
  id: number
  memberId: number
  type: string
  startMonth: number
  startYear: number
  endMonth: number | null
  endYear: number | null
  monthlyGoal: number | null
}

const { stints, failNext } = vi.hoisted(() => ({
  stints: new Map<number, StoredEnrolment>(),
  failNext: { overlap: false },
}))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn({}, 1),
}))
vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(() => ({ flash: vi.fn() })),
  commitSession: vi.fn(() => '__session=committed'),
}))
vi.mock('~/features/publishers/server/pioneer-enrolment.queries', () => ({
  getEnrolmentsForMember: vi.fn((_db: unknown, memberId: number) =>
    [...stints.values()].filter(stint => stint.memberId === memberId),
  ),
}))
vi.mock('~/features/publishers/server/pioneer-enrolment.workflow', async () => {
  const { ConflictError } = await import('~/shared/errors/app-error.server')
  const { PIONEER_ENROLMENT_CONFLICT } = await import('~/features/publishers/server/pioneer-enrolment.aggregate')
  return {
    enrolPioneer: vi.fn(
      (
        _db: unknown,
        memberId: number,
        _c: number,
        _a: number,
        input: Partial<StoredEnrolment> & { type: string; startMonth: number; startYear: number },
      ) => {
        if (failNext.overlap) throw new ConflictError(PIONEER_ENROLMENT_CONFLICT.overlap)
        const id = stints.size + 100
        stints.set(id, {
          ...input,
          endMonth: input.endMonth ?? null,
          endYear: input.endYear ?? null,
          monthlyGoal: input.monthlyGoal ?? null,
          id,
          memberId,
        })
      },
    ),
    updatePioneerEnrolment: vi.fn(
      (_db: unknown, id: number, _c: number, _a: number, input: Partial<StoredEnrolment>) => {
        const stint = stints.get(id)
        if (!stint) return
        stints.set(id, {
          ...stint,
          ...input,
          endMonth: input.endMonth ?? null,
          endYear: input.endYear ?? null,
          monthlyGoal: input.monthlyGoal === undefined ? stint.monthlyGoal : input.monthlyGoal,
        })
      },
    ),
    endPioneerEnrolment: vi.fn(
      (_db: unknown, id: number, _c: number, _a: number, end: { endMonth: number; endYear: number }) => {
        const stint = stints.get(id)
        if (stint) stints.set(id, { ...stint, ...end })
      },
    ),
    removePioneerEnrolment: vi.fn((_db: unknown, id: number) => stints.delete(id)),
  }
})

const { formRequest, routeContext } = await import('~/tests/helpers/route-action')
const { Permission } = await import('~/shared/types/permission')
const route = await import('./enrolments')

const MANAGER = [Permission.CanViewPublishers, Permission.CanManagePublishers]

/** A route result as status and body: `data()` wraps both, a plain object is a 200. */
async function settle(run: () => unknown) {
  const result = (await run()) as { type?: string; data?: unknown; init?: { status?: number } | null }
  if (result?.type === 'DataWithResponseInit') {
    return { status: result.init?.status ?? 200, body: result.data as Record<string, unknown> }
  }
  return { status: 200, body: result as Record<string, unknown> }
}

function post(publisherId: number, fields: Record<string, string>, permissions = MANAGER) {
  return settle(() =>
    route.action({
      request: formRequest(`https://unitae.example.test/publishers/${publisherId}/enrolments`, fields),
      params: { publisherId: String(publisherId) },
      context: routeContext(permissions),
    } as never),
  )
}

function seed(stint: Partial<StoredEnrolment> & { id: number; memberId: number }) {
  stints.set(stint.id, {
    type: 'PionnierPermanant',
    startMonth: 8,
    startYear: 2024,
    endMonth: null,
    endYear: null,
    monthlyGoal: null,
    ...stint,
  })
}

beforeEach(() => {
  stints.clear()
  failNext.overlap = false
})

describe('enrolling from the record', () => {
  it('turns away a caller who does not manage publishers', async () => {
    const refused = await post(41, { intent: 'remove', enrolmentId: '1' }, [Permission.CanViewPublishers]).catch(
      (error: unknown) => error,
    )
    expect(refused).toBeInstanceOf(Response)
    expect((refused as Response).headers.get('Location')).toBe('/')
  })

  it('enrols a one-month auxiliary for that month, at the chosen goal', async () => {
    const saved = await post(41, {
      intent: 'create',
      mode: 'monthly-aux',
      startMonth: '3',
      startYear: '2027',
      monthlyGoal: '15',
    })
    expect(saved).toEqual({ status: 200, body: { ok: true } })
    expect([...stints.values()]).toEqual([
      expect.objectContaining({
        memberId: 41,
        type: 'PionnierAuxiliaires',
        startMonth: 3,
        endMonth: 3,
        endYear: 2027,
        monthlyGoal: 15,
      }),
    ])
  })

  it('enrols a standing service from its first month, open-ended', async () => {
    await post(41, { intent: 'create', mode: 'special', startMonth: '8', startYear: '2026' })
    expect([...stints.values()]).toEqual([
      expect.objectContaining({ memberId: 41, type: 'PionnierSpecial', startMonth: 8, endMonth: null }),
    ])
  })

  it('says why an overlapping enrolment is refused, and keeps the dialog open on it', async () => {
    failNext.overlap = true
    const refused = await post(41, { intent: 'create', mode: 'permanent', startMonth: '8', startYear: '2026' })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toMatchObject({ '': [expect.stringContaining('déjà')] })
  })
})

describe('correcting, stopping and removing a stint', () => {
  it('corrects the service, the period, and drops a cleared goal back to the rate', async () => {
    seed({ id: 1, memberId: 41, type: 'PionnierAuxiliaires', startMonth: 2, startYear: 2024, monthlyGoal: 30 })
    const saved = await post(41, {
      intent: 'correct',
      enrolmentId: '1',
      mode: 'permanent',
      startMonth: '8',
      startYear: '2024',
      endMonth: '',
      endYear: '',
      monthlyGoal: '',
    })
    expect(saved.status).toBe(200)
    expect(stints.get(1)).toMatchObject({ type: 'PionnierPermanant', startMonth: 8, endMonth: null, monthlyGoal: null })
  })

  it('keeps a corrected one-month auxiliary to its single month', async () => {
    seed({
      id: 1,
      memberId: 41,
      type: 'PionnierAuxiliaires',
      startMonth: 2,
      startYear: 2024,
      endMonth: 2,
      endYear: 2024,
    })
    await post(41, {
      intent: 'correct',
      enrolmentId: '1',
      mode: 'monthly-aux',
      startMonth: '3',
      startYear: '2024',
      endMonth: '6',
      endYear: '2024',
      monthlyGoal: '15',
    })
    expect(stints.get(1)).toMatchObject({ startMonth: 3, endMonth: 3, endYear: 2024, monthlyGoal: 15 })
  })

  it('stops the ongoing service after a month', async () => {
    seed({ id: 1, memberId: 41 })
    await post(41, { intent: 'stop', enrolmentId: '1', endMonth: '2', endYear: '2027' })
    expect(stints.get(1)).toMatchObject({ endMonth: 2, endYear: 2027 })
  })

  it('removes a stint recorded in error', async () => {
    seed({ id: 1, memberId: 41 })
    await post(41, { intent: 'remove', enrolmentId: '1' })
    expect(stints.has(1)).toBe(false)
  })

  it("leaves another publisher's stint alone, whatever the form says", async () => {
    seed({ id: 1, memberId: 42 })
    const removed = await post(41, { intent: 'remove', enrolmentId: '1' })
    const stopped = await post(41, { intent: 'stop', enrolmentId: '1', endMonth: '2', endYear: '2027' })
    expect([removed.status, stopped.status]).toEqual([404, 404])
    expect(stints.get(1)).toMatchObject({ memberId: 42, endMonth: null })
  })
})
