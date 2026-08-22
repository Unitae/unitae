import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    role: { findFirst: vi.fn() },
    member: { findMany: vi.fn() },
    memberRoleAssignment: { findMany: vi.fn() },
    templatePartAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    eventPartAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    eventPart: { findFirst: vi.fn() },
    partPresetAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    templateServicePartAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    eventServicePartAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  },
}))

const {
  getPartAssignmentAllowedRoleIds,
  resolveEligibleUserIds,
  setPartPresetAllowedRoles,
  setTemplatePartAllowedRoles,
  setPartAssignmentAllowedRoles,
  setTemplateServicePartAllowedRoles,
  setServicePartAssignmentAllowedRoles,
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
      data: [{ eventPartId: 200, roleId: 9, asKind: 'speaker', congregationId: 1 }],
      skipDuplicates: true,
    })
  })
})

describe('setTemplateServicePartAllowedRoles', () => {
  it('writes service-role rows without asKind', async () => {
    vi.mocked(db.templateServicePartAllowedRole.findMany).mockResolvedValue([] as never)
    vi.mocked(db.templateServicePartAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    await setTemplateServicePartAllowedRoles(db, 300, [4, 5], 1)

    expect(db.templateServicePartAllowedRole.createMany).toHaveBeenCalledWith({
      data: [
        { servicePartId: 300, roleId: 4, congregationId: 1 },
        { servicePartId: 300, roleId: 5, congregationId: 1 },
      ],
      skipDuplicates: true,
    })
  })
})

describe('setServicePartAssignmentAllowedRoles', () => {
  it('writes service-role-assignment rows', async () => {
    vi.mocked(db.eventServicePartAllowedRole.findMany).mockResolvedValue([] as never)
    vi.mocked(db.eventServicePartAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    await setServicePartAssignmentAllowedRoles(db, 400, [6], 1)

    expect(db.eventServicePartAllowedRole.createMany).toHaveBeenCalledWith({
      data: [{ eventServicePartId: 400, roleId: 6, congregationId: 1 }],
      skipDuplicates: true,
    })
  })
})

describe('getPartAssignmentAllowedRoleIds with a preset', () => {
  it("prefers the preset's roles for the slot", async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({ presetId: 55 } as never)
    vi.mocked(db.partPresetAllowedRole.findMany).mockResolvedValue([{ roleId: 700 }] as never)
    vi.mocked(db.eventPartAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }] as never)

    expect(await getPartAssignmentAllowedRoleIds(db, 9, 'speaker', 1)).toEqual([700])
  })

  it('falls back to the part when the preset has none configured', async () => {
    // An empty preset means "not configured", not "everyone" — reading it as
    // authoritative would widen this part's audience to the whole congregation.
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({ presetId: 55 } as never)
    vi.mocked(db.partPresetAllowedRole.findMany).mockResolvedValue([] as never)
    vi.mocked(db.eventPartAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }] as never)

    expect(await getPartAssignmentAllowedRoleIds(db, 9, 'speaker', 1)).toEqual([1])
  })

  it('uses the part alone when it has no preset', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({ presetId: null } as never)
    vi.mocked(db.eventPartAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }] as never)

    expect(await getPartAssignmentAllowedRoleIds(db, 9, 'speaker', 1)).toEqual([1])
    expect(db.partPresetAllowedRole.findMany).not.toHaveBeenCalled()
  })

  it('keeps the two slots separate', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({ presetId: 55 } as never)
    vi.mocked(db.partPresetAllowedRole.findMany).mockResolvedValue([{ roleId: 700 }] as never)
    vi.mocked(db.eventPartAllowedRole.findMany).mockResolvedValue([] as never)

    await getPartAssignmentAllowedRoleIds(db, 9, 'reader', 1)

    expect(vi.mocked(db.partPresetAllowedRole.findMany).mock.calls[0]?.[0]?.where?.asKind).toBe('reader')
  })
})

describe('setPartAssignmentAllowedRoles on a part that carries a kind', () => {
  // The read side resolves the kind first, so it answers "who may fill this
  // slot". The write side must not reuse that answer as its baseline: the rows
  // it adds and deletes belong to the part, and diffing them against the kind's
  // list makes every write wrong in a different way.
  it("clears the part's own rows when the selection is emptied", async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({ presetId: 55 } as never)
    vi.mocked(db.partPresetAllowedRole.findMany).mockResolvedValue([{ roleId: 700 }] as never)
    vi.mocked(db.eventPartAllowedRole.findMany).mockResolvedValue([{ roleId: 42 }] as never)

    const diff = await setPartAssignmentAllowedRoles(db, 9, 'speaker', [], 1)

    expect(diff.removed).toEqual([42])
    expect(vi.mocked(db.eventPartAllowedRole.deleteMany).mock.calls[0]?.[0]?.where?.roleId).toEqual({ in: [42] })
  })

  it('reports no change when the selection already matches the part', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({ presetId: 55 } as never)
    vi.mocked(db.partPresetAllowedRole.findMany).mockResolvedValue([{ roleId: 700 }] as never)
    vi.mocked(db.eventPartAllowedRole.findMany).mockResolvedValue([{ roleId: 42 }] as never)

    const diff = await setPartAssignmentAllowedRoles(db, 9, 'speaker', [42], 1)

    expect(diff).toEqual({ added: [], removed: [] })
    expect(db.eventPartAllowedRole.createMany).not.toHaveBeenCalled()
    expect(db.eventPartAllowedRole.deleteMany).not.toHaveBeenCalled()
  })
})

describe('setPartPresetAllowedRoles', () => {
  it('adds only the roles that are missing', async () => {
    vi.mocked(db.partPresetAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }] as never)

    const diff = await setPartPresetAllowedRoles(db, 55, 'speaker', [1, 2], 1)

    expect(diff.added).toEqual([2])
    expect(vi.mocked(db.partPresetAllowedRole.createMany).mock.calls[0]?.[0]?.data).toEqual([
      { presetId: 55, roleId: 2, asKind: 'speaker', congregationId: 1 },
    ])
  })

  it('removes the roles that are no longer wanted', async () => {
    vi.mocked(db.partPresetAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }, { roleId: 2 }] as never)

    const diff = await setPartPresetAllowedRoles(db, 55, 'speaker', [1], 1)

    expect(diff.removed).toEqual([2])
  })

  it('writes nothing when the selection is unchanged', async () => {
    vi.mocked(db.partPresetAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }] as never)

    await setPartPresetAllowedRoles(db, 55, 'speaker', [1], 1)

    expect(db.partPresetAllowedRole.createMany).not.toHaveBeenCalled()
    expect(db.partPresetAllowedRole.deleteMany).not.toHaveBeenCalled()
  })

  it('clearing every role leaves the kind unconfigured, not forbidden', async () => {
    // Empty means "any member" downstream, so this is how a kind stops
    // restricting rather than how it blocks everyone.
    vi.mocked(db.partPresetAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }] as never)

    const diff = await setPartPresetAllowedRoles(db, 55, 'speaker', [], 1)

    expect(diff.removed).toEqual([1])
  })
})
