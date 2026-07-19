import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    role: { findFirst: vi.fn() },
    member: { findMany: vi.fn() },
    memberRoleAssignment: { findMany: vi.fn() },
    templatePartAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    eventPartAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    templateServiceRoleAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    eventServiceRoleAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  },
}))

const {
  resolveEligibleUserIds,
  setTemplatePartAllowedRoles,
  setPartAssignmentAllowedRoles,
  setTemplateServiceRoleAllowedRoles,
  setServiceRoleAssignmentAllowedRoles,
} = await import('./allowed-roles.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('resolveEligibleUserIds', () => {
  it('returns `member` built-in role members when allowed list is empty', async () => {
    vi.mocked(db.role.findFirst).mockResolvedValue({ id: 42 } as never)
    vi.mocked(db.memberRoleAssignment.findMany).mockResolvedValue([{ memberId: 7 }, { memberId: 11 }] as never)

    const result = await resolveEligibleUserIds(db, [], 1)

    expect(db.role.findFirst).toHaveBeenCalledWith({
      where: { key: 'member', isBuiltIn: true, congregationId: 1 },
      select: { id: true },
    })
    expect(db.memberRoleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roleId: 42 }) }),
    )
    expect(result).toEqual([7, 11])
  })

  it('returns empty array when no member role exists for empty list', async () => {
    vi.mocked(db.role.findFirst).mockResolvedValue(null as never)
    const result = await resolveEligibleUserIds(db, [], 1)
    expect(result).toEqual([])
  })

  it('returns member IDs reached via either assignment table for non-empty list', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([{ id: 5 }, { id: 7 }] as never)

    const result = await resolveEligibleUserIds(db, [10, 20], 1)

    expect(db.member.findMany).toHaveBeenCalledWith({
      where: {
        congregationId: 1,
        leftAt: null,
        anonymizedAt: null,
        OR: [
          { roleAssignments: { some: { roleId: { in: [10, 20] } } } },
          { account: { roleAssignments: { some: { roleId: { in: [10, 20] } } } } },
        ],
      },
      select: { id: true },
    })
    expect(result).toEqual([5, 7])
    expect(db.role.findFirst).not.toHaveBeenCalled()
    expect(db.memberRoleAssignment.findMany).not.toHaveBeenCalled()
  })
})

describe('setTemplatePartAllowedRoles', () => {
  it('does nothing when desired matches previous', async () => {
    vi.mocked(db.templatePartAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }, { roleId: 2 }] as never)

    const result = await setTemplatePartAllowedRoles(db, 100, 'speaker', [1, 2], 1)

    expect(result).toEqual({ added: [], removed: [] })
    expect(db.templatePartAllowedRole.createMany).not.toHaveBeenCalled()
    expect(db.templatePartAllowedRole.deleteMany).not.toHaveBeenCalled()
  })

  it('adds and removes the diff', async () => {
    vi.mocked(db.templatePartAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }, { roleId: 2 }] as never)
    vi.mocked(db.templatePartAllowedRole.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(db.templatePartAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    const result = await setTemplatePartAllowedRoles(db, 100, 'reader', [2, 3], 1)

    expect(result.added).toEqual([3])
    expect(result.removed).toEqual([1])
    expect(db.templatePartAllowedRole.deleteMany).toHaveBeenCalledWith({
      where: { partId: 100, asKind: 'reader', congregationId: 1, roleId: { in: [1] } },
    })
    expect(db.templatePartAllowedRole.createMany).toHaveBeenCalledWith({
      data: [{ partId: 100, roleId: 3, asKind: 'reader', congregationId: 1 }],
      skipDuplicates: true,
    })
  })
})

describe('setPartAssignmentAllowedRoles', () => {
  it('writes to the assignment table with asKind', async () => {
    vi.mocked(db.eventPartAllowedRole.findMany).mockResolvedValue([] as never)
    vi.mocked(db.eventPartAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    await setPartAssignmentAllowedRoles(db, 200, 'speaker', [9], 1)

    expect(db.eventPartAllowedRole.createMany).toHaveBeenCalledWith({
      data: [{ assignmentId: 200, roleId: 9, asKind: 'speaker', congregationId: 1 }],
      skipDuplicates: true,
    })
  })
})

describe('setTemplateServiceRoleAllowedRoles', () => {
  it('writes service-role rows without asKind', async () => {
    vi.mocked(db.templateServiceRoleAllowedRole.findMany).mockResolvedValue([] as never)
    vi.mocked(db.templateServiceRoleAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    await setTemplateServiceRoleAllowedRoles(db, 300, [4, 5], 1)

    expect(db.templateServiceRoleAllowedRole.createMany).toHaveBeenCalledWith({
      data: [
        { serviceRoleId: 300, roleId: 4, congregationId: 1 },
        { serviceRoleId: 300, roleId: 5, congregationId: 1 },
      ],
      skipDuplicates: true,
    })
  })
})

describe('setServiceRoleAssignmentAllowedRoles', () => {
  it('writes service-role-assignment rows', async () => {
    vi.mocked(db.eventServiceRoleAllowedRole.findMany).mockResolvedValue([] as never)
    vi.mocked(db.eventServiceRoleAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    await setServiceRoleAssignmentAllowedRoles(db, 400, [6], 1)

    expect(db.eventServiceRoleAllowedRole.createMany).toHaveBeenCalledWith({
      data: [{ assignmentId: 400, roleId: 6, congregationId: 1 }],
      skipDuplicates: true,
    })
  })
})
