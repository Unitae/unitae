import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { OrganigramChanged: 'OrganigramChanged', UserRoleAssignmentChanged: 'UserRoleAssignmentChanged' },
  audit: vi.fn(),
}))

const mockDb = {
  role: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  member: { findFirst: vi.fn() },
  userRoleAssignment: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  $executeRaw: vi.fn(),
}

const {
  addRoleToOrganigram,
  moveOrganigramNode,
  removeRoleFromOrganigram,
  seatMember,
  setOrganigramParent,
  unseatMember,
} = await import('./organigram.server')
const { ForbiddenError, NotFoundError, ValidationError } = await import('~/shared/errors/app-error.server')

const CONGREGATION = 10
const ACTOR = 99

/** Three flagged roles: 1 → 2 → 3, plus a detached 4. */
function treeRows() {
  return [
    { id: 1, key: 'elder', parentRoleId: null, organigramOrder: 1 },
    { id: 2, key: 'comite', parentRoleId: 1, organigramOrder: 5 },
    { id: 3, key: 'secretaire', parentRoleId: 2, organigramOrder: 5 },
    { id: 4, key: 'nettoyage', parentRoleId: 1, organigramOrder: 10 },
  ]
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('setOrganigramParent', () => {
  it('refuses to move a role under its own descendant', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 2, key: 'comite' })
    mockDb.role.findMany.mockResolvedValue(treeRows())

    // 3 is a child of 2, so parenting 2 under 3 closes a loop.
    await expect(setOrganigramParent(mockDb as never, 2, 3, CONGREGATION, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(mockDb.role.update).not.toHaveBeenCalled()
  })

  it('refuses to give an identity roster a parent', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 1, key: 'elder' })
    mockDb.role.findMany.mockResolvedValue(treeRows())

    await expect(setOrganigramParent(mockDb as never, 1, 4, CONGREGATION, ACTOR)).rejects.toBeInstanceOf(ForbiddenError)
    expect(mockDb.role.update).not.toHaveBeenCalled()
  })

  it('moves a role under an unrelated parent', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 3, key: 'secretaire' })
    mockDb.role.findMany.mockResolvedValue(treeRows())
    mockDb.role.update.mockResolvedValue({ id: 3 })

    await setOrganigramParent(mockDb as never, 3, 4, CONGREGATION, ACTOR)

    expect(mockDb.role.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parentRoleId: 4 }) }),
    )
  })

  it('rejects a role that is not in this congregation', async () => {
    mockDb.role.findFirst.mockResolvedValue(null)
    await expect(setOrganigramParent(mockDb as never, 77, null, CONGREGATION, ACTOR)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})

describe('addRoleToOrganigram', () => {
  it('adopts an existing role rather than creating one', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 4, key: 'nettoyage' })
    mockDb.role.findMany.mockResolvedValue(treeRows())
    mockDb.role.update.mockResolvedValue({ id: 4 })

    await addRoleToOrganigram(mockDb as never, 4, 1, CONGREGATION, ACTOR)

    expect(mockDb.role.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ showInOrganigram: true, parentRoleId: 1 }) }),
    )
  })

  it('refuses a role that may never appear in the chart', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 9, key: 'sister' })
    mockDb.role.findMany.mockResolvedValue(treeRows())

    await expect(addRoleToOrganigram(mockDb as never, 9, 1, CONGREGATION, ACTOR)).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('removeRoleFromOrganigram', () => {
  it('lifts the children to the removed node’s parent instead of orphaning them', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 2, key: 'comite', parentRoleId: 1 })
    mockDb.role.update.mockResolvedValue({ id: 2 })
    mockDb.role.updateMany.mockResolvedValue({ count: 1 })

    await removeRoleFromOrganigram(mockDb as never, 2, CONGREGATION, ACTOR)

    // 3 was under 2; after removing 2 it must hang from 1, not from nothing.
    expect(mockDb.role.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ parentRoleId: 2 }),
        data: { parentRoleId: 1 },
      }),
    )
    expect(mockDb.role.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ showInOrganigram: false, parentRoleId: null }) }),
    )
  })
})

describe('moveOrganigramNode', () => {
  it('keeps siblings on a 5-unit spacing after a swap', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 4, key: 'nettoyage', parentRoleId: 1 })
    mockDb.role.findMany.mockResolvedValue([
      { id: 2, key: 'comite', parentRoleId: 1, organigramOrder: 5 },
      { id: 4, key: 'nettoyage', parentRoleId: 1, organigramOrder: 10 },
    ])
    mockDb.role.update.mockResolvedValue({})

    await moveOrganigramNode(mockDb as never, 4, 'up', CONGREGATION, ACTOR)

    const written = mockDb.role.update.mock.calls.map(call => call[0].data.organigramOrder).sort((a, b) => a - b)
    expect(written).toEqual([5, 10])
  })
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

describe('unseatMember', () => {
  it('removes only that person from only that node', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 500, account: { id: 800 } })
    mockDb.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 })

    await unseatMember(mockDb as never, 3, 500, CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { userId: 800, roleId: 3, congregationId: CONGREGATION },
    })
  })
})
