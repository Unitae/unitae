import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    boardSectionVisibilityRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    userRoleAssignment: { findMany: vi.fn() },
  },
}))

vi.mock('~/shared/domain/audit.server', async () => {
  const actual = await vi.importActual<typeof import('~/shared/domain/audit.server')>('~/shared/domain/audit.server')
  return {
    ...actual,
    audit: vi.fn(),
  }
})

const { getSectionVisibilityRoleIds, setSectionVisibilityRoles, getViewerRoleIds } = await import(
  './section-visibility.server'
)
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
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { added: [3], removed: [1] } }),
    )
  })
})

describe('getViewerRoleIds', () => {
  it('returns the role IDs assigned to the user', async () => {
    vi.mocked(db.userRoleAssignment.findMany).mockResolvedValue([{ roleId: 11 }, { roleId: 13 }] as never)

    const result = await getViewerRoleIds(db, 42, 1)

    expect(db.userRoleAssignment.findMany).toHaveBeenCalledWith({
      where: { userId: 42, congregationId: 1 },
      select: { roleId: true },
    })
    expect(result).toEqual([11, 13])
  })
})
