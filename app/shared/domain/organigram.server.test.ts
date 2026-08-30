import { beforeEach, describe, expect, it, vi } from 'vitest'

const syncServiceCommitteeMembers = vi.fn()
vi.mock('~/shared/domain/service-committee.server', () => ({ syncServiceCommitteeMembers }))

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { OrganigramChanged: 'OrganigramChanged', UserRoleAssignmentChanged: 'UserRoleAssignmentChanged' },
  audit: vi.fn(),
}))

const mockDb = {
  role: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  member: { findFirst: vi.fn() },
  memberRoleAssignment: { findFirst: vi.fn() },
  userRoleAssignment: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  $executeRaw: vi.fn(),
}

const {
  addRoleToOrganigram,
  createServiceInOrganigram,
  moveOrganigramNode,
  removeRoleFromOrganigram,
  setOrganigramParent,
  setRoleSinglePerson,
} = await import('./organigram.server')
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } = await import(
  '~/shared/errors/app-error.server'
)

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
    mockDb.role.findFirst.mockResolvedValue({ id: 2, key: 'comite', showInOrganigram: true })
    mockDb.role.findMany.mockResolvedValue(treeRows())

    // 3 is a child of 2, so parenting 2 under 3 closes a loop.
    await expect(setOrganigramParent(mockDb as never, 2, 3, CONGREGATION, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(mockDb.role.update).not.toHaveBeenCalled()
  })

  it('refuses to give an identity roster a parent', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 1, key: 'elder', showInOrganigram: true })
    mockDb.role.findMany.mockResolvedValue(treeRows())

    await expect(setOrganigramParent(mockDb as never, 1, 4, CONGREGATION, ACTOR)).rejects.toBeInstanceOf(ForbiddenError)
    expect(mockDb.role.update).not.toHaveBeenCalled()
  })

  it('refuses to move a role that is not in the chart', async () => {
    // The UI only offers chart nodes, but a crafted request could attach an off-chart role —
    // invisible on the page, yet enough to block deleting its parent later.
    mockDb.role.findFirst.mockResolvedValue({ id: 4, key: 'nettoyage', showInOrganigram: false })
    mockDb.role.findMany.mockResolvedValue(treeRows())

    await expect(setOrganigramParent(mockDb as never, 4, 1, CONGREGATION, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(mockDb.role.update).not.toHaveBeenCalled()
  })

  it('moves a role under an unrelated parent', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 3, key: 'secretaire', showInOrganigram: true })
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

  it.each([
    'service-committee',
    'coordinator',
    'secretary',
    'service-overseer',
  ])('refuses to take %s out of the chart', async key => {
    mockDb.role.findFirst.mockResolvedValue({ id: 2, key, parentRoleId: 1 })

    await expect(removeRoleFromOrganigram(mockDb as never, 2, CONGREGATION, ACTOR)).rejects.toThrow(ForbiddenError)
    // The refusal must come before any write: a committee stripped of its posts and then
    // rejected would be worse than either outcome on its own.
    expect(mockDb.role.updateMany).not.toHaveBeenCalled()
    expect(mockDb.role.update).not.toHaveBeenCalled()
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

describe('setRoleSinglePerson', () => {
  it('flags a custom chart role as personal', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 7,
      key: 'responsable-audio-video',
      isBuiltIn: false,
      isSinglePerson: false,
      showInOrganigram: true,
    })
    mockDb.userRoleAssignment.findMany.mockResolvedValue([])
    mockDb.role.update.mockResolvedValue({})

    await setRoleSinglePerson(mockDb as never, 7, true, CONGREGATION, ACTOR)

    expect(mockDb.role.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isSinglePerson: true } }))
  })

  it('refuses while several titulaires are seated', async () => {
    // Flagging a role that currently shows three «responsables» would make the chart lie about
    // which of them holds it. The seats are resolved first, then the flag.
    mockDb.role.findFirst.mockResolvedValue({
      id: 7,
      key: 'responsable-audio-video',
      isBuiltIn: false,
      isSinglePerson: false,
      showInOrganigram: true,
    })
    mockDb.userRoleAssignment.findMany.mockResolvedValue([{ userId: 800 }, { userId: 801 }])

    await expect(setRoleSinglePerson(mockDb as never, 7, true, CONGREGATION, ACTOR)).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(mockDb.role.update).not.toHaveBeenCalled()
  })

  it('refuses built-in roles, whose shape is structure', async () => {
    // The committee posts are permanently personal, the rosters and `admin` never are —
    // in both directions the flag is not the congregation's to change.
    mockDb.role.findFirst.mockResolvedValue({
      id: 3,
      key: 'coordinator',
      isBuiltIn: true,
      isSinglePerson: true,
      showInOrganigram: true,
    })

    await expect(setRoleSinglePerson(mockDb as never, 3, false, CONGREGATION, ACTOR)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(mockDb.role.update).not.toHaveBeenCalled()
  })

  it('writes nothing when the flag already has the submitted value', async () => {
    // The role edit form submits the checkbox on every save; an unchanged value must not
    // churn the row or fill the audit log with changes nobody made.
    mockDb.role.findFirst.mockResolvedValue({
      id: 7,
      key: 'responsable-audio-video',
      isBuiltIn: false,
      isSinglePerson: true,
      showInOrganigram: true,
    })

    await setRoleSinglePerson(mockDb as never, 7, true, CONGREGATION, ACTOR)

    expect(mockDb.role.update).not.toHaveBeenCalled()
  })

  it('turns the flag off without counting seats', async () => {
    // Loosening cannot make the chart lie, so nothing blocks it.
    mockDb.role.findFirst.mockResolvedValue({
      id: 7,
      key: 'responsable-audio-video',
      isBuiltIn: false,
      isSinglePerson: true,
      showInOrganigram: true,
    })
    mockDb.role.update.mockResolvedValue({})

    await setRoleSinglePerson(mockDb as never, 7, false, CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.findMany).not.toHaveBeenCalled()
    expect(mockDb.role.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isSinglePerson: false } }))
  })
})

describe('createServiceInOrganigram', () => {
  it('creates a personal role when asked to', async () => {
    mockDb.role.findFirst
      .mockResolvedValueOnce(null) // createRole: no key collision
      .mockResolvedValue({ id: 42, key: 'responsable-estrade' })
    mockDb.role.create.mockResolvedValue({ id: 42, key: 'responsable-estrade' })
    mockDb.role.findMany.mockResolvedValue(treeRows())
    mockDb.role.update.mockResolvedValue({ id: 42 })

    await createServiceInOrganigram(mockDb as never, 'Responsable estrade', 1, CONGREGATION, ACTOR, {
      isSinglePerson: true,
    })

    expect(mockDb.role.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isSinglePerson: true }) }),
    )
  })

  it('creates the service and attaches it under the given parent', async () => {
    mockDb.role.findFirst
      .mockResolvedValueOnce(null) // createRole: no key collision
      .mockResolvedValue({ id: 42, key: 'comite-de-service' }) // requireRole, after creation
    mockDb.role.create.mockResolvedValue({ id: 42, key: 'comite-de-service' })
    mockDb.role.findMany.mockResolvedValue(treeRows())
    mockDb.role.update.mockResolvedValue({ id: 42 })

    const created = await createServiceInOrganigram(mockDb as never, 'Comité de service', 1, CONGREGATION, ACTOR)

    expect(created).toBe(42)
    expect(mockDb.role.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Comité de service', isBuiltIn: false }) }),
    )
    expect(mockDb.role.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ showInOrganigram: true, parentRoleId: 1 }) }),
    )
  })

  it('refuses a name that already exists, so two services never share one identity', async () => {
    // `createRole` slugifies the name into the key and throws on collision. Surfacing that is what
    // stops a congregation ending up with two « Sono » that split the same team in half.
    mockDb.role.findFirst.mockResolvedValue({ id: 9 })

    await expect(createServiceInOrganigram(mockDb as never, 'Sono', null, CONGREGATION, ACTOR)).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(mockDb.role.update).not.toHaveBeenCalled()
  })
})
