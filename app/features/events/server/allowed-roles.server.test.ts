import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    role: { findFirst: vi.fn() },
    userRoleAssignment: { findMany: vi.fn() },
    programmeTemplatePartAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    programmePartAssignmentAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    programmeTemplateServiceRoleAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    programmeServiceRoleAssignmentAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
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
  it('returns publisher role members when allowed list is empty', async () => {
    vi.mocked(db.role.findFirst).mockResolvedValue({ id: 42 } as never)
    vi.mocked(db.userRoleAssignment.findMany).mockResolvedValue([{ userId: 7 }, { userId: 11 }] as never)

    const result = await resolveEligibleUserIds(db, [], 1)

    expect(db.role.findFirst).toHaveBeenCalledWith({
      where: { key: 'publisher', isBuiltIn: true, congregationId: 1 },
      select: { id: true },
    })
    expect(db.userRoleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roleId: 42 }) }),
    )
    expect(result).toEqual([7, 11])
  })

  it('returns empty array when no publisher role exists for empty list', async () => {
    vi.mocked(db.role.findFirst).mockResolvedValue(null as never)
    const result = await resolveEligibleUserIds(db, [], 1)
    expect(result).toEqual([])
  })

  it('returns user IDs assigned to any allowed role for non-empty list', async () => {
    vi.mocked(db.userRoleAssignment.findMany).mockResolvedValue([
      { userId: 5 },
      { userId: 7 },
      { userId: 5 }, // duplicate (user has both roles)
    ] as never)

    const result = await resolveEligibleUserIds(db, [10, 20], 1)

    expect(db.userRoleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ roleId: { in: [10, 20] }, congregationId: 1 }),
      }),
    )
    expect(result.sort()).toEqual([5, 7])
    expect(db.role.findFirst).not.toHaveBeenCalled()
  })

  it('filters out inactive and anonymized users via the where clause', async () => {
    vi.mocked(db.userRoleAssignment.findMany).mockResolvedValue([] as never)

    await resolveEligibleUserIds(db, [10], 1)

    expect(db.userRoleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: { active: true, anonymizedAt: null },
        }),
      }),
    )
  })
})

describe('setTemplatePartAllowedRoles', () => {
  it('does nothing when desired matches previous', async () => {
    vi.mocked(db.programmeTemplatePartAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }, { roleId: 2 }] as never)

    const result = await setTemplatePartAllowedRoles(db, 100, 'speaker', [1, 2], 1)

    expect(result).toEqual({ added: [], removed: [] })
    expect(db.programmeTemplatePartAllowedRole.createMany).not.toHaveBeenCalled()
    expect(db.programmeTemplatePartAllowedRole.deleteMany).not.toHaveBeenCalled()
  })

  it('adds and removes the diff', async () => {
    vi.mocked(db.programmeTemplatePartAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }, { roleId: 2 }] as never)
    vi.mocked(db.programmeTemplatePartAllowedRole.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(db.programmeTemplatePartAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    const result = await setTemplatePartAllowedRoles(db, 100, 'reader', [2, 3], 1)

    expect(result.added).toEqual([3])
    expect(result.removed).toEqual([1])
    expect(db.programmeTemplatePartAllowedRole.deleteMany).toHaveBeenCalledWith({
      where: { partId: 100, asKind: 'reader', congregationId: 1, roleId: { in: [1] } },
    })
    expect(db.programmeTemplatePartAllowedRole.createMany).toHaveBeenCalledWith({
      data: [{ partId: 100, roleId: 3, asKind: 'reader', congregationId: 1 }],
      skipDuplicates: true,
    })
  })
})

describe('setPartAssignmentAllowedRoles', () => {
  it('writes to the assignment table with asKind', async () => {
    vi.mocked(db.programmePartAssignmentAllowedRole.findMany).mockResolvedValue([] as never)
    vi.mocked(db.programmePartAssignmentAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    await setPartAssignmentAllowedRoles(db, 200, 'speaker', [9], 1)

    expect(db.programmePartAssignmentAllowedRole.createMany).toHaveBeenCalledWith({
      data: [{ assignmentId: 200, roleId: 9, asKind: 'speaker', congregationId: 1 }],
      skipDuplicates: true,
    })
  })
})

describe('setTemplateServiceRoleAllowedRoles', () => {
  it('writes service-role rows without asKind', async () => {
    vi.mocked(db.programmeTemplateServiceRoleAllowedRole.findMany).mockResolvedValue([] as never)
    vi.mocked(db.programmeTemplateServiceRoleAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    await setTemplateServiceRoleAllowedRoles(db, 300, [4, 5], 1)

    expect(db.programmeTemplateServiceRoleAllowedRole.createMany).toHaveBeenCalledWith({
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
    vi.mocked(db.programmeServiceRoleAssignmentAllowedRole.findMany).mockResolvedValue([] as never)
    vi.mocked(db.programmeServiceRoleAssignmentAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    await setServiceRoleAssignmentAllowedRoles(db, 400, [6], 1)

    expect(db.programmeServiceRoleAssignmentAllowedRole.createMany).toHaveBeenCalledWith({
      data: [{ assignmentId: 400, roleId: 6, congregationId: 1 }],
      skipDuplicates: true,
    })
  })
})
