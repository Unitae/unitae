import { beforeEach, describe, expect, it, vi } from 'vitest'

// The field service group pages: who may open a group, what the edit action answers when the
// service refuses a leader, and the two membership actions. The services are mocked; the tests
// read the Response (or the data) each route hands back.

const { flash } = vi.hoisted(() => ({ flash: vi.fn() }))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn({}, 1),
}))

vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(async () => ({ flash })),
  commitSession: vi.fn(async () => '__session=committed'),
}))

const GROUP = {
  id: 4,
  name: 'Nord',
  address: '1 rue',
  responsible: { id: 10, firstname: 'Paul', lastname: 'Martin' },
  deputy: null,
  reportWindow: [{ month: 9, year: 2026 }],
  members: [
    {
      id: 11,
      firstname: 'Ana',
      lastname: 'Lima',
      email: '',
      reports: [{ month: 9, year: 2026, status: 'irregular', id: 5 }],
      signals: [{ kind: 'baptism-anniversary' }],
      emergencyGaps: ['contact'],
    },
  ],
  inactiveMembers: [],
}

vi.mock('~/features/publishers/server/groups.server', () => ({
  getGroup: vi.fn(async (_db: unknown, groupId: number) => (groupId === 4 ? GROUP : null)),
}))
vi.mock('~/features/publishers/server/update-group.server', () => ({ updateGroup: vi.fn() }))
vi.mock('~/features/publishers/server/group-members.server', () => ({
  addGroupMember: vi.fn(),
  removeGroupMember: vi.fn(),
}))

const { Permission } = await import('~/shared/types/permission')
const { ConflictError, ValidationError } = await import('~/shared/errors/app-error.server')
const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const { updateGroup } = await import('~/features/publishers/server/update-group.server')
const { addGroupMember, removeGroupMember } = await import('~/features/publishers/server/group-members.server')
const viewGroup = await import('./group')
const editGroup = await import('./edit-group')
const addMember = await import('./group-member-add')
const removeMember = await import('./group-member-remove')

type ViewData = {
  group: typeof GROUP
  roles: {
    canViewPublishers: boolean
    canEditPublishers: boolean
    canCorrectReports: boolean
    canRecordVisits: boolean
  }
}
type ViewMember = (typeof GROUP)['members'][number]

function view(groupId: string, ...args: Parameters<typeof routeContext>) {
  return respondOrData(() => viewGroup.loader({ params: { groupId }, context: routeContext(...args) } as never))
}

// A loader resolves to its data and redirects by throwing; an action may also answer with data().
async function respondOrData(run: () => unknown): Promise<unknown> {
  try {
    return await run()
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
}

const EDIT_FORM = { name: 'Nord', address: '1 rue', responsible: '10', deputy: '' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('group view loader', () => {
  it('opens a group for a caller who can view publishers', async () => {
    const result = (await view('4', [Permission.CanViewPublishers])) as ViewData

    expect(result.group.id).toBe(4)
    expect(result.roles.canViewPublishers).toBe(true)
  })

  it.each([
    ['overseer', { responsibleFor: { id: 4 } }],
    ['deputy', { deputyFor: { id: 4 } }],
  ])('opens his own group for a %s without the publisher permission', async (_role, leads) => {
    const result = (await view('4', [], { member: { id: 10, ...leads } })) as ViewData

    expect(result.group.id).toBe(4)
    expect(result.roles.canViewPublishers).toBe(false)
  })

  // Whether someone preached is a pastoral fact: only those who record the group's reports see it.
  it('shows the report statuses only to those who record the group activity', async () => {
    const viewer = (await view('4', [Permission.CanViewPublishers])) as ViewData
    const recorder = (await view('4', [Permission.CanViewPublishers, Permission.CanRecordActivity])) as ViewData
    const overseer = (await view('4', [], { member: { id: 10, responsibleFor: { id: 4 } } })) as ViewData

    expect((viewer.group.members[0] as ViewMember).reports).toEqual([])
    expect((recorder.group.members[0] as ViewMember).reports).toHaveLength(1)
    expect((overseer.group.members[0] as ViewMember).reports).toHaveLength(1)
  })

  // A filed report opens for correction only for those who may correct it: no dead-end link.
  it('lets filed reports open for correction only for those who may correct them', async () => {
    const recorder = (await view('4', [Permission.CanViewPublishers, Permission.CanRecordActivity])) as ViewData
    const corrector = (await view('4', [
      Permission.CanViewPublishers,
      Permission.CanRecordActivity,
      Permission.CanCorrectActivity,
    ])) as ViewData
    const overseer = (await view('4', [], { member: { id: 10, responsibleFor: { id: 4 } } })) as ViewData

    expect(recorder.roles.canCorrectReports).toBe(false)
    expect(corrector.roles.canCorrectReports).toBe(true)
    expect(overseer.roles.canCorrectReports).toBe(true)
  })

  // The publisher manager and the group's own overseer and assistant record pastoral visits.
  it('offers to record a pastoral visit only to those who may', async () => {
    const viewer = (await view('4', [Permission.CanViewPublishers])) as ViewData
    const manager = (await view('4', [Permission.CanViewPublishers, Permission.CanManagePublishers])) as ViewData
    const overseer = (await view('4', [], { member: { id: 10, responsibleFor: { id: 4 } } })) as ViewData
    const assistant = (await view('4', [], { member: { id: 12, deputyFor: { id: 4 } } })) as ViewData

    expect(viewer.roles.canRecordVisits).toBe(false)
    expect(manager.roles.canRecordVisits).toBe(true)
    expect(overseer.roles.canRecordVisits).toBe(true)
    expect(assistant.roles.canRecordVisits).toBe(true)
  })

  it('shows the missing emergency information only to those who may see it', async () => {
    const viewer = (await view('4', [Permission.CanViewPublishers])) as ViewData
    const emergency = (await view('4', [Permission.CanViewPublishers, Permission.CanViewEmergencyInfo])) as ViewData
    const overseer = (await view('4', [], { member: { id: 10, responsibleFor: { id: 4 } } })) as ViewData

    expect((viewer.group.members[0] as ViewMember).emergencyGaps).toEqual([])
    expect((emergency.group.members[0] as ViewMember).emergencyGaps).toEqual(['contact'])
    expect((overseer.group.members[0] as ViewMember).emergencyGaps).toEqual(['contact'])
  })

  it('shows the pastoral signals to everyone who may open the page', async () => {
    const viewer = (await view('4', [Permission.CanViewPublishers])) as ViewData

    expect((viewer.group.members[0] as ViewMember).signals).toEqual([{ kind: 'baptism-anniversary' }])
  })

  it('refuses another group to an overseer without the publisher permission', async () => {
    const result = await view('5', [], { member: { id: 10, responsibleFor: { id: 4 } } })

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).headers.get('Location')).toBe('/')
  })

  // Regression: the pencil showed for the group permission and led to a page that sent the caller home.
  it('offers the publisher pencil only to a caller who may edit publishers', async () => {
    const groupsOnly = (await view('4', [
      Permission.CanViewPublishers,
      Permission.CanManagePublisherGroups,
    ])) as ViewData
    const publishers = (await view('4', [Permission.CanViewPublishers, Permission.CanManagePublishers])) as ViewData

    expect(groupsOnly.roles.canEditPublishers).toBe(false)
    expect(publishers.roles.canEditPublishers).toBe(true)
  })
})

describe('edit group action', () => {
  function submit(fields: Record<string, string>) {
    return respondOrData(() =>
      editGroup.action({
        request: formRequest('https://unitae.example.test/groups/4/edit', fields),
        params: { groupId: '4' },
        context: routeContext([Permission.CanManagePublisherGroups]),
      } as never),
    )
  }

  // Regression: a stale choice reached the unique constraint and the page answered 500.
  it("answers the service's refusal on the field, without redirecting", async () => {
    vi.mocked(updateGroup).mockRejectedValue(new ValidationError('responsible', 'already oversees Sud'))

    const result = (await submit(EDIT_FORM)) as { data: { error: Record<string, string[]> }; init: { status: number } }

    expect(result.init.status).toBe(400)
    expect(result.data.error).toEqual({ responsible: ['already oversees Sud'] })
  })

  it('goes back to the group once it is saved', async () => {
    vi.mocked(updateGroup).mockResolvedValue({ id: 4, name: 'Nord' } as never)

    const response = (await submit(EDIT_FORM)) as Response

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/groups/4/view')
  })
})

describe('group membership actions', () => {
  function add(permissions: (typeof Permission)[keyof typeof Permission][], memberId = '9') {
    return respond(() =>
      addMember.action({
        request: formRequest('https://unitae.example.test/groups/4/members/add', { memberId }),
        params: { groupId: '4' },
        context: routeContext(permissions),
      } as never),
    )
  }

  function remove(permissions: (typeof Permission)[keyof typeof Permission][]) {
    return respond(() =>
      removeMember.action({
        request: formRequest('https://unitae.example.test/groups/4/members/9/remove', {}),
        params: { groupId: '4', memberId: '9' },
        context: routeContext(permissions),
      } as never),
    )
  }

  it('refuses a caller who does not manage groups', async () => {
    const response = await add([Permission.CanViewPublishers])

    expect(response.headers.get('Location')).toBe('/')
    expect(addGroupMember).not.toHaveBeenCalled()
  })

  it('adds the publisher and goes back to the edit page with a confirmation', async () => {
    vi.mocked(addGroupMember).mockResolvedValue({ firstname: 'Ana', lastname: 'Lima' })

    const response = await add([Permission.CanManagePublisherGroups])

    expect(addGroupMember).toHaveBeenCalledWith({}, 4, 1, 9, 7)
    expect(response.headers.get('Location')).toBe('/groups/4/edit')
    expect(flash).toHaveBeenCalledWith('success', expect.stringContaining('Ana'))
  })

  it('says why a leader of another group cannot be added', async () => {
    vi.mocked(addGroupMember).mockRejectedValue(new ConflictError('Paul leads Sud'))

    const response = await add([Permission.CanManagePublisherGroups])

    expect(response.headers.get('Location')).toBe('/groups/4/edit')
    expect(flash).toHaveBeenCalledWith('error', 'Paul leads Sud')
  })

  it('refuses an empty choice without calling the service', async () => {
    const response = await add([Permission.CanManagePublisherGroups], '')

    expect(response.headers.get('Location')).toBe('/groups/4/edit')
    expect(addGroupMember).not.toHaveBeenCalled()
    expect(flash).toHaveBeenCalledWith('error', expect.any(String))
  })

  it('removes a member and says why the overseer cannot be removed', async () => {
    vi.mocked(removeGroupMember).mockResolvedValueOnce({ firstname: 'Ana', lastname: 'Lima' })
    vi.mocked(removeGroupMember).mockRejectedValueOnce(new ConflictError('Paul leads Nord'))

    await remove([Permission.CanManagePublisherGroups])
    const refused = await remove([Permission.CanManagePublisherGroups])

    expect(removeGroupMember).toHaveBeenCalledWith({}, 4, 1, 9, 7)
    expect(refused.headers.get('Location')).toBe('/groups/4/edit')
    expect(flash.mock.calls).toEqual([
      ['success', expect.stringContaining('Ana')],
      ['error', 'Paul leads Nord'],
    ])
  })
})
