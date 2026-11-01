import { beforeEach, describe, expect, it, vi } from 'vitest'

// A group's responsible or deputy may enter and correct activity for their own group's publishers
// only; CanManagePublishers covers everyone. Activity rows live in an in-memory store, so the tests
// assert on what was written.

const { activities } = vi.hoisted(() => ({
  activities: new Map<number, { publisherId: number; hours: number }>(),
}))

const PUBLISHERS = new Map([
  [41, { id: 41, firstname: 'Own', lastname: 'Group', publisherGroupId: 9 }],
  [42, { id: 42, firstname: 'Other', lastname: 'Group', publisherGroupId: 4 }],
])

const fakeDb = {
  member: {
    findUnique: vi.fn(
      async ({ where }: { where: { id_congregationId: { id: number } } }) =>
        PUBLISHERS.get(where.id_congregationId.id) ?? null,
    ),
  },
  publisherActivity: {
    // The loaders' first read: a test makes it throw to see that the permission check let it through.
    findFirst: vi.fn(),
    findUnique: vi.fn(async ({ where }: { where: { id_congregationId: { id: number } } }) => {
      const row = activities.get(where.id_congregationId.id)
      if (!row) return null
      return {
        id: where.id_congregationId.id,
        month: 5,
        year: 2026,
        creditHours: null,
        ...row,
        publisher: PUBLISHERS.get(row.publisherId),
      }
    }),
  },
}

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn(fakeDb, 1),
}))
vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(async () => ({ flash: vi.fn() })),
  commitSession: vi.fn(async () => '__session=committed'),
}))
vi.mock('~/features/publishers/index.server', () => ({ getMonthEnrolment: vi.fn(async () => null) }))
vi.mock('~/features/publishers/server/publishers.server', () => ({ getPublishers: vi.fn(async () => []) }))
vi.mock('~/features/publishers/server/publisher-activity-mutations.server', () => ({
  createPublisherActivity: vi.fn(async (_db: unknown, input: { publisherId: number; hours: number }) => {
    const id = activities.size + 100
    activities.set(id, { publisherId: input.publisherId, hours: input.hours })
    return { id, month: 5, year: 2026 }
  }),
  updatePublisherActivity: vi.fn(async (_db: unknown, id: number, _c: number, _a: number, input: { hours: number }) => {
    const row = activities.get(id)
    if (row) activities.set(id, { ...row, hours: input.hours })
  }),
}))

const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const { Permission } = await import('~/shared/types/permission')
const newActivity = await import('./new')
const editActivity = await import('./edit')

// The responsible of group 9, holding no publisher permission.
const RESPONSIBLE = { member: { id: 3, publisherGroupId: 9, responsibleFor: { id: 9 }, deputyFor: null } }

function create(publisherId: number, caller: Parameters<typeof routeContext> = [[], RESPONSIBLE]) {
  return respond(() =>
    newActivity.action({
      request: formRequest('https://unitae.example.test/publishers/activity/new', {
        publisher: String(publisherId),
        month: '5',
        year: '2026',
        hours: '12',
      }),
      params: {},
      context: routeContext(...caller),
    } as never),
  )
}

function edit(activityId: number, caller: Parameters<typeof routeContext> = [[], RESPONSIBLE]) {
  return respond(() =>
    editActivity.action({
      request: formRequest(`https://unitae.example.test/publishers/activity/${activityId}/edit`, {
        type: 'Normal',
        hours: '99',
      }),
      params: { activityId: String(activityId) },
      context: routeContext(...caller),
    } as never),
  )
}

beforeEach(() => {
  activities.clear()
  activities.set(1, { publisherId: 41, hours: 5 })
  activities.set(2, { publisherId: 42, hours: 5 })
})

describe('activity entry by a group responsible', () => {
  it("records activity for a publisher of the responsible's own group", async () => {
    await create(41)
    expect([...activities.values()]).toContainEqual({ publisherId: 41, hours: 12 })
  })

  it('refuses to record activity for a publisher of another group', async () => {
    const response = await create(42)
    expect(response.headers.get('Location')).toBe('/')
    expect([...activities.values()].filter(a => a.publisherId === 42)).toEqual([{ publisherId: 42, hours: 5 }])
  })

  it("corrects activity of the responsible's own group", async () => {
    await edit(1)
    expect(activities.get(1)?.hours).toBe(99)
  })

  it('refuses to correct activity of another group', async () => {
    const response = await edit(2)
    expect(response.headers.get('Location')).toBe('/')
    expect(activities.get(2)?.hours).toBe(5)
  })
})

// Regression: « Peut enregistrer l'activité mensuelle » showed the report links on the activity list,
// the publisher page and the group page, but the forms only accepted CanManagePublishers, so a
// holder of the activity permission alone landed back on the home page.
describe('activity entry by a holder of the activity permission', () => {
  const RECORDER: Parameters<typeof routeContext> = [[Permission.CanRecordActivity]]
  const PAST_THE_GATE = new Error('past the permission check')

  it('opens the new report form', async () => {
    fakeDb.publisherActivity.findFirst.mockRejectedValueOnce(PAST_THE_GATE)

    const result = respondOrData(() =>
      newActivity.loader({
        request: new Request('https://unitae.example.test/publishers/activity/new?publisherId=42&month=5&year=2026'),
        params: {},
        context: routeContext(...RECORDER),
      } as never),
    )

    await expect(result).rejects.toBe(PAST_THE_GATE)
  })

  it("records any publisher's activity", async () => {
    await create(42, RECORDER)
    expect([...activities.values()]).toContainEqual({ publisherId: 42, hours: 12 })
  })

  // Changing a filed report takes « Peut modifier et supprimer l'activité enregistrée ».
  it('refuses to open a filed report for correction', async () => {
    const result = await respondOrData(() =>
      editActivity.loader({
        request: new Request('https://unitae.example.test/publishers/activity/2/edit'),
        params: { activityId: '2' },
        context: routeContext(...RECORDER),
      } as never),
    )
    expect((result as Response).headers.get('Location')).toBe('/')
  })

  it('refuses to correct a filed report', async () => {
    const response = await edit(2, RECORDER)
    expect(response.headers.get('Location')).toBe('/')
    expect(activities.get(2)?.hours).toBe(5)
  })
})

describe('activity correction by a holder of the correction permission', () => {
  const CORRECTOR: Parameters<typeof routeContext> = [[Permission.CanCorrectActivity]]
  const PAST_THE_GATE = new Error('past the permission check')

  it('opens a report to correct it', async () => {
    fakeDb.publisherActivity.findFirst.mockRejectedValueOnce(PAST_THE_GATE)

    const result = respondOrData(() =>
      editActivity.loader({
        request: new Request('https://unitae.example.test/publishers/activity/2/edit'),
        params: { activityId: '2' },
        context: routeContext(...CORRECTOR),
      } as never),
    )

    await expect(result).rejects.toBe(PAST_THE_GATE)
  })

  it("corrects any publisher's activity", async () => {
    await edit(2, CORRECTOR)
    expect(activities.get(2)?.hours).toBe(99)
  })
})

// A loader resolves to its data and redirects by throwing.
async function respondOrData(run: () => unknown): Promise<unknown> {
  try {
    return await run()
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
}
