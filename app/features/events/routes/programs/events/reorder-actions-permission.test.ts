import { beforeEach, describe, expect, it, vi } from 'vitest'

// Dragging a part or a duty on an event posts its new order, which fills that schedule (plan §10): « Attribuer »,
// « Gérer », or the responsible of that schedule's template; the other schedule's responsible is refused (D31). Who may
// fill which schedule is faked (canFillSchedule has its own integration test); the route must ask about the schedule it
// reorders. Reorders land in an in-memory list, so the tests assert on whether one was written.

const { state } = vi.hoisted(() => ({
  state: {
    /** The schedules the caller is responsible for, by their items' kind. */
    responsibleFor: [] as ('part' | 'service')[],
    event: { id: 40, templateId: 3 } as { id: number; templateId: number | null } | null,
    written: [] as { kind: 'parts' | 'services'; eventId: number; orderedIds: number[] }[],
  },
}))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) =>
    fn({ item: { findMany: () => Promise.resolve([]) } }),
}))

vi.mock('~/features/events/server/schedule-rights.server', () => ({
  canFillSchedule: (
    _db: unknown,
    can: (permission: string) => boolean,
    _userId: number,
    _event: unknown,
    kind: 'part' | 'service',
  ) =>
    Promise.resolve(
      can('can-assign-program-parts') || can('can-manage-programs') || state.responsibleFor.includes(kind),
    ),
}))

vi.mock('~/features/events/server/programme-event.queries', () => ({
  findProgrammeEvent: () => Promise.resolve(state.event),
}))

vi.mock('~/features/events/server/event-parts.server', () => ({
  reorderPartAssignments: (_db: unknown, _cong: number, eventId: number, orderedIds: number[]) => {
    state.written.push({ kind: 'parts', eventId, orderedIds })
    return Promise.resolve(true)
  },
}))

vi.mock('~/features/events/server/reorder-services.server', () => ({
  reorderServiceAssignments: (_db: unknown, _cong: number, eventId: number, orderedIds: number[]) => {
    state.written.push({ kind: 'services', eventId, orderedIds })
    return Promise.resolve(true)
  },
}))

const { Permission } = await import('~/shared/types/permission')
const { respond, routeContext } = await import('~/tests/helpers/route-action')
const reorderParts = await import('./reorder-parts')
const reorderServices = await import('./reorder-services')

type Action = typeof reorderServices.action
type Granted = (typeof Permission)[keyof typeof Permission]

function post(action: Action, permissions: Granted[], body: unknown) {
  return action({
    request: new Request('https://unitae.example.test/programs/events/40/reorder', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    params: { eventId: '40' },
    context: routeContext(permissions),
  } as never)
}

beforeEach(() => {
  state.responsibleFor = []
  state.event = { id: 40, templateId: 3 }
  state.written = []
})

describe.each([
  {
    kind: 'parts' as const,
    schedule: 'part' as const,
    other: 'service' as const,
    action: reorderParts.action as unknown as Action,
  },
  {
    kind: 'services' as const,
    schedule: 'service' as const,
    other: 'part' as const,
    action: reorderServices.action as Action,
  },
])('the event’s reorder-$kind action', ({ kind, schedule, other, action }) => {
  it('writes the order for a caller who may assign the programme', async () => {
    const result = await post(action, [Permission.CanAssignProgramParts], { itemIds: [2, 1] })

    expect(result).toEqual({ ok: true })
    expect(state.written).toEqual([{ kind, eventId: 40, orderedIds: [2, 1] }])
  })

  it('writes the order for the responsible of this schedule, without the right', async () => {
    state.responsibleFor = [schedule]

    expect(await post(action, [], { itemIds: [2, 1] })).toEqual({ ok: true })
    expect(state.written).toHaveLength(1)
  })

  it('refuses the responsible of the other schedule only (D31)', async () => {
    state.responsibleFor = [other]

    const response = await respond(() => post(action, [], { itemIds: [2, 1] }))

    expect(response.headers.get('Location')).toBe('/programs')
    expect(state.written).toEqual([])
  })

  it('refuses a caller with neither, and an event that is not a programme', async () => {
    const refused = await respond(() => post(action, [], { itemIds: [2, 1] }))
    state.event = null
    const missing = await respond(() => post(action, [Permission.CanAssignProgramParts], { itemIds: [2, 1] }))

    expect([refused.headers.get('Location'), missing.headers.get('Location')]).toEqual(['/programs', '/programs'])
    expect(state.written).toEqual([])
  })

  it('answers no, writing nothing, to an empty or malformed list', async () => {
    const empty = await post(action, [Permission.CanAssignProgramParts], { itemIds: [] })
    const notAList = await post(action, [Permission.CanAssignProgramParts], { itemIds: '2,1' })

    expect([empty, notAList]).toEqual([{ ok: false }, { ok: false }])
    expect(state.written).toEqual([])
  })

  // A page the previous image rendered posts the old rows' ids under the old name (plan T12): never read as items.
  it('answers no, writing nothing, to the old rows’ ids of a previous page', async () => {
    const result = await post(action, [Permission.CanAssignProgramParts], { orderedIds: [2, 1] })

    expect(result).toEqual({ ok: false })
    expect(state.written).toEqual([])
  })
})
