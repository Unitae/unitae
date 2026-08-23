import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    boardSectionVisibilityRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  },
}))

vi.mock('~/shared/auth/permissions.server', () => ({
  resolveEffectiveRoleIds: vi.fn(),
}))

vi.mock('~/shared/domain/audit.server', async () => {
  const actual = await vi.importActual<typeof import('~/shared/domain/audit.server')>('~/shared/domain/audit.server')
  return {
    ...actual,
    audit: vi.fn(),
  }
})

const { buildSectionVisibilityFilter, getSectionVisibilityRoleIds, setSectionVisibilityRoles } = await import(
  './section-visibility.server'
)
const { resolveEffectiveRoleIds } = await import('~/shared/auth/permissions.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { audit, AuditAction } = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getSectionVisibilityRoleIds', () => {
  it('returns the role IDs for the section', async () => {
    vi.mocked(db.boardSectionVisibilityRole.findMany).mockResolvedValue([{ roleId: 5 }, { roleId: 9 }] as never)

    const result = await getSectionVisibilityRoleIds(db, 100, 1)

    expect(db.boardSectionVisibilityRole.findMany).toHaveBeenCalledWith({
      where: { sectionId: 100, congregationId: 1 },
      select: { roleId: true },
    })
    expect(result).toEqual([5, 9])
  })
})

describe('setSectionVisibilityRoles', () => {
  it('does nothing and emits no audit when desired matches previous', async () => {
    vi.mocked(db.boardSectionVisibilityRole.findMany).mockResolvedValue([{ roleId: 1 }, { roleId: 2 }] as never)

    const result = await setSectionVisibilityRoles(db, 100, [2, 1], 1, 7)

    expect(result).toEqual({ added: [], removed: [] })
    expect(db.boardSectionVisibilityRole.createMany).not.toHaveBeenCalled()
    expect(db.boardSectionVisibilityRole.deleteMany).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('adds new roles when previous is empty', async () => {
    vi.mocked(db.boardSectionVisibilityRole.findMany).mockResolvedValue([] as never)
    vi.mocked(db.boardSectionVisibilityRole.createMany).mockResolvedValue({ count: 2 } as never)

    const result = await setSectionVisibilityRoles(db, 100, [3, 4], 1, 7)

    expect(result.added).toEqual([3, 4])
    expect(result.removed).toEqual([])
    expect(db.boardSectionVisibilityRole.createMany).toHaveBeenCalledWith({
      data: [
        { sectionId: 100, roleId: 3, congregationId: 1 },
        { sectionId: 100, roleId: 4, congregationId: 1 },
      ],
      skipDuplicates: true,
    })
    expect(db.boardSectionVisibilityRole.deleteMany).not.toHaveBeenCalled()
    expect(audit).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.BoardSectionVisibilityChanged,
        congregationId: 1,
        actorId: 7,
        entityType: 'BoardSection',
        entityId: 100,
        metadata: { added: [3, 4], removed: [] },
      }),
    )
  })

  it('removes all roles when desired is empty', async () => {
    vi.mocked(db.boardSectionVisibilityRole.findMany).mockResolvedValue([{ roleId: 1 }, { roleId: 2 }] as never)
    vi.mocked(db.boardSectionVisibilityRole.deleteMany).mockResolvedValue({ count: 2 } as never)

    const result = await setSectionVisibilityRoles(db, 100, [], 1, 7)

    expect(result.added).toEqual([])
    expect(result.removed).toEqual([1, 2])
    expect(db.boardSectionVisibilityRole.deleteMany).toHaveBeenCalledWith({
      where: { sectionId: 100, congregationId: 1, roleId: { in: [1, 2] } },
    })
    expect(db.boardSectionVisibilityRole.createMany).not.toHaveBeenCalled()
    expect(audit).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { added: [], removed: [1, 2] },
      }),
    )
  })

  it('adds and removes for a partial overlap diff', async () => {
    vi.mocked(db.boardSectionVisibilityRole.findMany).mockResolvedValue([{ roleId: 1 }, { roleId: 2 }] as never)
    vi.mocked(db.boardSectionVisibilityRole.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(db.boardSectionVisibilityRole.createMany).mockResolvedValue({ count: 1 } as never)

    const result = await setSectionVisibilityRoles(db, 100, [2, 3], 1, 7)

    expect(result).toEqual({ added: [3], removed: [1] })
    expect(db.boardSectionVisibilityRole.deleteMany).toHaveBeenCalledWith({
      where: { sectionId: 100, congregationId: 1, roleId: { in: [1] } },
    })
    expect(db.boardSectionVisibilityRole.createMany).toHaveBeenCalledWith({
      data: [{ sectionId: 100, roleId: 3, congregationId: 1 }],
      skipDuplicates: true,
    })
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { added: [3], removed: [1] } }))
  })
})

describe('buildSectionVisibilityFilter', () => {
  // A section with no visibility roles is open to anyone holding BoardViewer;
  // one that names roles is open only to those roles, with no manager bypass.
  // The filter is written to be spread into a `where`, so a caller that fetches
  // by id gets "not visible" and "not found" as the same answer.
  it('lets an unrestricted section through for anyone', async () => {
    vi.mocked(resolveEffectiveRoleIds).mockResolvedValue([])

    const filter = await buildSectionVisibilityFilter(db, 7, 1)

    expect(filter).toEqual({
      OR: [{ visibilityRoles: { none: {} } }, { visibilityRoles: { some: { roleId: { in: [] } } } }],
    })
  })

  it("names the viewer's own roles for restricted sections", async () => {
    vi.mocked(resolveEffectiveRoleIds).mockResolvedValue([4, 9])

    const filter = await buildSectionVisibilityFilter(db, 7, 1)

    expect(filter.OR[1]).toEqual({ visibilityRoles: { some: { roleId: { in: [4, 9] } } } })
    expect(resolveEffectiveRoleIds).toHaveBeenCalledWith(db, 7, 1)
  })
})
