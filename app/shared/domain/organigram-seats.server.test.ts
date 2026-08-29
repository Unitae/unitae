import { beforeEach, describe, expect, it, vi } from 'vitest'

const syncServiceCommitteeMembers = vi.fn()
vi.mock('~/shared/domain/service-committee.server', () => ({ syncServiceCommitteeMembers }))

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { OrganigramChanged: 'OrganigramChanged', UserRoleAssignmentChanged: 'UserRoleAssignmentChanged' },
  audit: vi.fn(),
}))

const mockDb = {
  role: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  member: { findFirst: vi.fn() },
  memberRoleAssignment: { findFirst: vi.fn() },
  userRoleAssignment: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}

const { seatMember, unseatMember } = await import('./organigram-seats.server')
const { NotFoundError, ValidationError } = await import('~/shared/errors/app-error.server')

const CONGREGATION = 10
const ACTOR = 99

beforeEach(() => {
  vi.resetAllMocks()
})

describe('seatMember', () => {
  it('writes the seat against the member’s account', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 3, key: 'secretaire' })
    mockDb.member.findFirst.mockResolvedValue({ id: 500, account: { id: 800 } })
    mockDb.userRoleAssignment.findFirst.mockResolvedValue(null)
    mockDb.userRoleAssignment.create.mockResolvedValue({})

    await seatMember(mockDb as never, { roleId: 3, memberId: 500, kind: 'leader' }, CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 800, roleId: 3, congregationId: CONGREGATION, kind: 'leader' } }),
    )
  })

  it('reports a clear error for a member with no login rather than a foreign-key failure', async () => {
    // Seats are account-bound for now, so a member without a UserAccount cannot hold one. The
    // picker greys these out; the service still has to refuse in terms the route can show.
    mockDb.role.findFirst.mockResolvedValue({ id: 3, key: 'secretaire' })
    mockDb.member.findFirst.mockResolvedValue({ id: 500, account: null })

    await expect(
      seatMember(mockDb as never, { roleId: 3, memberId: 500, kind: 'member' }, CONGREGATION, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(mockDb.userRoleAssignment.create).not.toHaveBeenCalled()
  })

  it('changes the seat kind when the person is already in the node', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 3, key: 'secretaire' })
    mockDb.member.findFirst.mockResolvedValue({ id: 500, account: { id: 800 } })
    mockDb.userRoleAssignment.findFirst.mockResolvedValue({ userId: 800, roleId: 3, kind: 'member' })
    mockDb.userRoleAssignment.update.mockResolvedValue({})

    await seatMember(mockDb as never, { roleId: 3, memberId: 500, kind: 'leader' }, CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.create).not.toHaveBeenCalled()
    expect(mockDb.userRoleAssignment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { kind: 'leader' } }))
  })
})

describe('seatMember — the three committee posts', () => {
  function seatOn(key: string) {
    mockDb.role.findFirst.mockResolvedValue({ id: 3, key })
    mockDb.member.findFirst.mockResolvedValue({ id: 500, account: { id: 800 } })
    mockDb.userRoleAssignment.findFirst.mockResolvedValue(null)
    mockDb.userRoleAssignment.create.mockResolvedValue({})
    mockDb.userRoleAssignment.deleteMany.mockResolvedValue({ count: 0 })
  }

  it.each([
    'coordinator',
    'secretary',
    'service-overseer',
  ])('hands %s over instead of adding a second holder', async key => {
    // There is exactly one coordinator. Seating a new one is the handover the whole feature
    // exists for: the outgoing holder loses the post, and with it the permissions it carries.
    seatOn(key)
    mockDb.memberRoleAssignment.findFirst.mockResolvedValue({ memberId: 500 })

    await seatMember(mockDb as never, { roleId: 3, memberId: 500, kind: 'leader' }, CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roleId: 3, NOT: { userId: 800 } }) }),
    )
  })

  it.each(['coordinator', 'secretary', 'service-overseer'])('refuses a %s who is not an elder', async key => {
    seatOn(key)
    mockDb.memberRoleAssignment.findFirst.mockResolvedValue(null)

    await expect(
      seatMember(mockDb as never, { roleId: 3, memberId: 500, kind: 'leader' }, CONGREGATION, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(mockDb.userRoleAssignment.create).not.toHaveBeenCalled()
    expect(mockDb.userRoleAssignment.deleteMany).not.toHaveBeenCalled()
  })

  it('joins the new holder to the committee, which is made of its three posts', async () => {
    seatOn('coordinator')
    mockDb.memberRoleAssignment.findFirst.mockResolvedValue({ memberId: 500 })

    await seatMember(mockDb as never, { roleId: 3, memberId: 500, kind: 'leader' }, CONGREGATION, ACTOR)

    expect(syncServiceCommitteeMembers).toHaveBeenCalledWith(mockDb, CONGREGATION, ACTOR)
  })

  it('does not touch the committee when an ordinary service is seated', async () => {
    seatOn('sono')

    await seatMember(mockDb as never, { roleId: 3, memberId: 500, kind: 'member' }, CONGREGATION, ACTOR)

    expect(syncServiceCommitteeMembers).not.toHaveBeenCalled()
  })

  it('leaves an ordinary service free to hold several people', async () => {
    seatOn('sono')

    await seatMember(mockDb as never, { roleId: 3, memberId: 500, kind: 'member' }, CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.deleteMany).not.toHaveBeenCalled()
    // No elder check either — «Sono» is open to anyone.
    expect(mockDb.memberRoleAssignment.findFirst).not.toHaveBeenCalled()
  })

  it('stores a post holder as its leader, whatever kind was submitted', async () => {
    // A single-person post has no membre/adjoint distinction to make.
    seatOn('coordinator')
    mockDb.memberRoleAssignment.findFirst.mockResolvedValue({ memberId: 500 })

    await seatMember(mockDb as never, { roleId: 3, memberId: 500, kind: 'member' }, CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'leader' }) }),
    )
  })
})

describe('unseatMember — the committee follows its posts', () => {
  it('takes the outgoing holder out of the committee too', async () => {
    // Half a handover is worse than none: leaving them on the committee keeps the permissions
    // the post was supposed to carry away with it.
    mockDb.role.findFirst.mockResolvedValue({ id: 3, key: 'secretary' })
    mockDb.member.findFirst.mockResolvedValue({ id: 500, account: { id: 800 } })
    mockDb.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 })

    await unseatMember(mockDb as never, 3, 500, CONGREGATION, ACTOR)

    expect(syncServiceCommitteeMembers).toHaveBeenCalledWith(mockDb, CONGREGATION, ACTOR)
  })
})

describe('unseatMember', () => {
  it('removes only that person from only that node', async () => {
    // Unseating now loads the role first, because whether the committee has to follow depends
    // on the role's key. That also means an unknown role is a 404 rather than a silent no-op.
    mockDb.role.findFirst.mockResolvedValue({ id: 3, key: 'sono' })
    mockDb.member.findFirst.mockResolvedValue({ id: 500, account: { id: 800 } })
    mockDb.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 })

    await unseatMember(mockDb as never, 3, 500, CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { userId: 800, roleId: 3, congregationId: CONGREGATION },
    })
  })
})
