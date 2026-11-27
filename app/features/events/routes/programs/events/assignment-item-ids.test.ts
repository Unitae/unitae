import { beforeEach, describe, expect, it, vi } from 'vitest'

// The assignment routes across the id flip (plan T12, 5i-b). A form of this image posts an item's id under a new name;
// one the previous image rendered posts the old row's id under the old name, which the route translates through the
// item's legacy key, of the kind it writes only. An id of the wrong kind, of another event or of no item is refused,
// never written. The real resolveEventItem runs, over an in-memory item table answering Prisma's where as the database
// would (the kind is the schedule's); who may assign, and the writers, are faked.

const { state } = vi.hoisted(() => ({
  state: {
    written: [] as { writer: string; id: number }[],
    /** The rights the caller holds, and the schedules they answer for by their items' kind. */
    permissions: ['can-assign-program-parts'] as string[],
    responsibleFor: [] as ('part' | 'service')[],
  },
}))

// Event 40 holds a part (item 900, mirroring old part 12), a duty (item 901, mirroring old duty 12: the two old tables
// numbered their rows apart, so the same old id names a part in one and a duty in the other), a part the app made after
// the flip (item 902, no old row) and a duty mirroring old duty 33, a number no old part has. Event 41 holds a part.
const ITEMS = [
  { id: 900, eventId: 40, kind: 'programme', legacyPartId: 12, legacyServiceId: null, name: 'Lecture' },
  { id: 901, eventId: 40, kind: 'duty', legacyPartId: null, legacyServiceId: 12, name: 'Sono' },
  { id: 902, eventId: 40, kind: 'programme', legacyPartId: null, legacyServiceId: null, name: 'Discours' },
  { id: 903, eventId: 40, kind: 'duty', legacyPartId: null, legacyServiceId: 33, name: 'Accueil' },
  { id: 950, eventId: 41, kind: 'programme', legacyPartId: 70, legacyServiceId: null, name: 'Prière' },
]

type Where = Record<string, unknown> & { AND?: { schedule: { kind: string } }[] }
const matches = (item: (typeof ITEMS)[number], where: Where) =>
  Object.entries(where).every(([key, value]) => {
    if (key === 'congregationId') return value === 1
    if (key === 'AND') return (value as Where['AND'])?.every(clause => clause.schedule.kind === item.kind)
    return item[key as keyof typeof item] === value
  })

const db = {
  item: {
    findFirst: ({ where }: { where: Where }) => Promise.resolve(ITEMS.find(item => matches(item, where)) ?? null),
    // The schedule an item is in, for the rights check naming it: one per kind on event 40.
    findMany: ({ where }: { where: { id: { in: number[] } } }) =>
      Promise.resolve(
        ITEMS.filter(item => where.id.in.includes(item.id)).map(item => ({ scheduleId: item.kind === 'duty' ? 2 : 1 })),
      ),
  },
}

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn(db),
}))

vi.mock('~/features/authentication/index.server', () => ({
  getSession: () => Promise.resolve({ flash: () => {} }),
  commitSession: () => Promise.resolve(''),
}))

vi.mock('~/features/events/server/programme-event.queries', () => ({
  findProgrammeEvent: () => Promise.resolve({ id: 40, templateId: 3, name: 'Réunion', startDate: new Date() }),
}))

vi.mock('~/features/events/server/schedule-rights.server', () => ({
  // Who may fill which schedule is canFillSchedule's own integration test; these check each route asks its own kind.
  canFillSchedule: (
    _db: unknown,
    can: (permission: string) => boolean,
    _userId: number,
    _event: unknown,
    kind: 'part' | 'service',
  ) => Promise.resolve(can('can-assign-program-parts') || state.responsibleFor.includes(kind)),
}))

vi.mock('~/features/events/server/notify-assignment.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/features/events/server/notify-assignment.server')>()),
  dispatchAssignmentDiffs: () => Promise.resolve(),
}))

vi.mock('~/features/events/server/event-part-assignments.server', () => {
  const write = (writer: string) => (_db: unknown, id: number) => {
    state.written.push({ writer, id })
    return Promise.resolve({ assignment: { id }, previousAssigneeId: null, previousAssistantId: null })
  }
  return {
    assignPart: write('assignPart'),
    assignServicePart: write('assignServicePart'),
    unassignPart: write('unassignPart'),
    unassignServicePart: write('unassignServicePart'),
  }
})

const { Permission } = await import('~/shared/types/permission')
const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const assignPart = await import('./assign-part')
const assignService = await import('./assign-service')
const removeAssignment = await import('./remove-assignment')

const params = { eventId: '40' }
const context = () => routeContext(state.permissions as (typeof Permission)[keyof typeof Permission][])

function postAssignPart(fields: Record<string, string>) {
  return assignPart.action({
    request: formRequest('https://unitae.example.test/programs/events/40/assign-part', { topic: '', ...fields }),
    params,
    context: context(),
  } as never)
}

function postAssignService(fields: Record<string, string>) {
  return assignService.action({
    request: formRequest('https://unitae.example.test/programs/events/40/assign-service', fields),
    params,
    context: context(),
  } as never)
}

function postRemove(query: string) {
  return removeAssignment.action({
    request: new Request(`https://unitae.example.test/programs/events/40/remove-assignment?${query}`, {
      method: 'POST',
    }),
    params,
    context: context(),
  } as never)
}

beforeEach(() => {
  state.written = []
  state.permissions = [Permission.CanAssignProgramParts]
  state.responsibleFor = []
})

describe('assigning a part', () => {
  it('writes the item a form of this image names by its id', async () => {
    await postAssignPart({ itemId: '900', assigneeId: '5' })
    expect(state.written).toEqual([{ writer: 'assignPart', id: 900 }])
  })

  it('writes the item whose old row a previous form names', async () => {
    await postAssignPart({ assignmentId: '12', assigneeId: '5' })
    expect(state.written).toEqual([{ writer: 'assignPart', id: 900 }])
  })

  it('writes a part the app made, which only its own id names', async () => {
    await postAssignPart({ itemId: '902', assigneeId: '5' })
    expect(state.written).toEqual([{ writer: 'assignPart', id: 902 }])
  })

  it('refuses a duty by its id or its old row’s, another event’s part, and a form naming no item', async () => {
    const forms: Record<string, string>[] = [{ itemId: '901' }, { assignmentId: '33' }, { itemId: '950' }, {}]
    for (const fields of forms) {
      const response = await respond(() => postAssignPart({ ...fields, assigneeId: '5' }))
      expect(response.headers.get('Location')).toBe('/programs')
    }
    expect(state.written).toEqual([])
  })
})

describe('assigning a duty', () => {
  it('writes the duty its old id names, never the part sharing that number', async () => {
    await postAssignService({ assignmentId: '12', assigneeId: '5' })
    await postAssignService({ itemId: '901', assigneeId: '5' })
    expect(state.written).toEqual([
      { writer: 'assignServicePart', id: 901 },
      { writer: 'assignServicePart', id: 901 },
    ])
  })

  it('refuses a part posted as a duty', async () => {
    const response = await respond(() => postAssignService({ itemId: '900', assigneeId: '5' }))
    expect(response.headers.get('Location')).toBe('/programs')
    expect(state.written).toEqual([])
  })
})

describe('removing an assignment', () => {
  it('unassigns the item a link of this image names, or the one whose old row a previous link names', async () => {
    await postRemove('type=part&item=900')
    await postRemove('type=service&id=12')
    expect(state.written).toEqual([
      { writer: 'unassignPart', id: 900 },
      { writer: 'unassignServicePart', id: 901 },
    ])
  })

  it('refuses an item of the other kind', async () => {
    const response = await respond(() => postRemove('type=service&item=900'))
    expect(response.headers.get('Location')).toBe('/programs')
    expect(state.written).toEqual([])
  })
})

// Without « Attribuer », each route asks for the schedule it writes: the duties' responsible fills the duties alone,
// the programme's the parts alone (plan §10, D31).
describe('whose right each route asks', () => {
  it('lets the duties’ responsible assign and remove a duty, never a part', async () => {
    state.permissions = []
    state.responsibleFor = ['service']
    await postAssignService({ itemId: '901', assigneeId: '5' })
    await postRemove('type=service&item=901')
    for (const refused of [
      () => postAssignPart({ itemId: '900', assigneeId: '5' }),
      () => postRemove('type=part&item=900'),
    ]) {
      expect((await respond(refused)).headers.get('Location')).toBe('/programs')
    }
    expect(state.written).toEqual([
      { writer: 'assignServicePart', id: 901 },
      { writer: 'unassignServicePart', id: 901 },
    ])
  })

  it('lets the programme’s responsible assign and remove a part, never a duty', async () => {
    state.permissions = []
    state.responsibleFor = ['part']
    await postAssignPart({ itemId: '900', assigneeId: '5' })
    await postRemove('type=part&item=900')
    for (const refused of [
      () => postAssignService({ itemId: '901', assigneeId: '5' }),
      () => postRemove('type=service&item=901'),
    ]) {
      expect((await respond(refused)).headers.get('Location')).toBe('/programs')
    }
    expect(state.written).toEqual([
      { writer: 'assignPart', id: 900 },
      { writer: 'unassignPart', id: 900 },
    ])
  })
})
