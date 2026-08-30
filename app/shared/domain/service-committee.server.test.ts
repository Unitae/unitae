import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { UserRoleAssignmentChanged: 'UserRoleAssignmentChanged' },
  audit: vi.fn(),
}))

const mockDb = {
  role: { findMany: vi.fn() },
  userRoleAssignment: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
}

const { syncServiceCommitteeMembers } = await import('./service-committee.server')

const CONGREGATION = 10
const ACTOR = 99

const COMMITTEE = 100
const COORDINATOR = 101
const SECRETARY = 102
const OVERSEER = 103

const ROLES = [
  { id: COMMITTEE, key: 'service-committee' },
  { id: COORDINATOR, key: 'coordinator' },
  { id: SECRETARY, key: 'secretary' },
  { id: OVERSEER, key: 'service-overseer' },
]

/** `findMany` on assignments is called twice: the posts' holders, then the committee's. */
function assignments(onPosts: number[], onCommittee: number[]) {
  mockDb.userRoleAssignment.findMany
    .mockResolvedValueOnce(onPosts.map(userId => ({ userId })))
    .mockResolvedValueOnce(onCommittee.map(userId => ({ userId })))
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.role.findMany.mockResolvedValue(ROLES)
  mockDb.userRoleAssignment.createMany.mockResolvedValue({ count: 0 })
  mockDb.userRoleAssignment.deleteMany.mockResolvedValue({ count: 0 })
})

describe('syncServiceCommitteeMembers', () => {
  it('puts the three post holders into the committee', async () => {
    // The committee IS the coordinator, the secretary and the service overseer. Its membership
    // is therefore derived, never typed — seating a coordinator joins them to the committee.
    assignments([800, 801, 802], [])

    await syncServiceCommitteeMembers(mockDb as never, CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          { userId: 800, roleId: COMMITTEE, congregationId: CONGREGATION, kind: 'member' },
          { userId: 801, roleId: COMMITTEE, congregationId: CONGREGATION, kind: 'member' },
          { userId: 802, roleId: COMMITTEE, congregationId: CONGREGATION, kind: 'member' },
        ]),
      }),
    )
  })

  it('takes out someone who no longer holds a post', async () => {
    // The outgoing coordinator leaves the committee at the same moment they leave the post,
    // which is what makes the handover complete rather than half-done.
    assignments([800], [800, 999])

    await syncServiceCommitteeMembers(mockDb as never, CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roleId: COMMITTEE, userId: { in: [999] } }) }),
    )
  })

  it('writes nothing when the membership already matches', async () => {
    // Called after every seat, so a no-op has to stay a no-op: churning rows would fill the
    // audit log with changes nobody made.
    assignments([800, 801], [801, 800])

    await syncServiceCommitteeMembers(mockDb as never, CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.createMany).not.toHaveBeenCalled()
    expect(mockDb.userRoleAssignment.deleteMany).not.toHaveBeenCalled()
  })

  it('counts someone holding two posts once', async () => {
    assignments([800, 800], [])

    await syncServiceCommitteeMembers(mockDb as never, CONGREGATION, ACTOR)

    const [call] = mockDb.userRoleAssignment.createMany.mock.calls
    expect(call?.[0].data).toHaveLength(1)
  })

  it('does nothing when the congregation has no committee role', async () => {
    // Provisioning creates it, but a congregation restored from an older archive may not have
    // one yet, and seating a person must not fail because of that.
    mockDb.role.findMany.mockResolvedValue([])

    await expect(syncServiceCommitteeMembers(mockDb as never, CONGREGATION, ACTOR)).resolves.toBeUndefined()
    expect(mockDb.userRoleAssignment.createMany).not.toHaveBeenCalled()
  })

  it('reads the posts’ holders, not the whole congregation', async () => {
    assignments([], [])

    await syncServiceCommitteeMembers(mockDb as never, CONGREGATION, ACTOR)

    const [postsQuery] = mockDb.userRoleAssignment.findMany.mock.calls
    expect(postsQuery?.[0].where.roleId).toEqual({ in: [COORDINATOR, SECRETARY, OVERSEER] })
  })

  it('counts only the titular holders — a post’s adjoint is not on the committee', async () => {
    // A post may carry deputy seats, but the committee IS its three titulaires: the coordinator's
    // adjoint helps the coordinator, they do not sit on the committee.
    assignments([], [])

    await syncServiceCommitteeMembers(mockDb as never, CONGREGATION, ACTOR)

    const [postsQuery] = mockDb.userRoleAssignment.findMany.mock.calls
    expect(postsQuery?.[0].where.kind).toBe('leader')
  })
})
