import { beforeEach, describe, expect, it, vi } from 'vitest'

// Dragging a part or a service on an event posts its new order. The action checks what the editor's handles promise:
// the assign right, or the template's whole-programme delegation — not its services-only one, which cannot restructure
// the event. The real canEditEvent runs; only who holds which delegation is faked. Reorders land in an in-memory list,
// so the tests assert on whether one was written.

const { state } = vi.hoisted(() => ({
  state: {
    /** The caller's delegation on the event's template. */
    delegation: null as 'programme' | 'service' | null,
    event: { id: 40, templateId: 3 } as { id: number; templateId: number | null } | null,
    written: [] as { kind: 'parts' | 'services'; eventId: number; orderedIds: number[] }[],
  },
}))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn({}),
}))

vi.mock('~/features/events/server/event-templates.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/features/events/server/event-templates.server')>()),
  // A programme delegation answers both scopes, a services one only its own.
  isTemplateResponsible: (_db: unknown, _templateId: number, _userId: number, _cong: number, scope = 'programme') =>
    Promise.resolve(
      state.delegation === 'programme' || state.delegation === scope ? { roleId: 1, roleName: 'Responsable' } : null,
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
  state.delegation = null
  state.event = { id: 40, templateId: 3 }
  state.written = []
})

describe.each([
  { kind: 'parts' as const, action: reorderParts.action as unknown as Action },
  { kind: 'services' as const, action: reorderServices.action as Action },
])('the event’s reorder-$kind action', ({ kind, action }) => {
  it('writes the order for a caller who may assign the programme', async () => {
    const result = await post(action, [Permission.CanAssignProgramParts], { itemIds: [2, 1] })

    expect(result).toEqual({ ok: true })
    expect(state.written).toEqual([{ kind, eventId: 40, orderedIds: [2, 1] }])
  })

  it('writes the order for the template’s programme responsible, without the right', async () => {
    state.delegation = 'programme'

    expect(await post(action, [], { itemIds: [2, 1] })).toEqual({ ok: true })
    expect(state.written).toHaveLength(1)
  })

  it('refuses the services-only responsible, like adding or removing a service', async () => {
    state.delegation = 'service'

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
