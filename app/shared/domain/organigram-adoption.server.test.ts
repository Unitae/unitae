import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { OrganigramChanged: 'OrganigramChanged' },
  audit: vi.fn(),
}))

const mockDb = {
  role: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  rolePermission: { findMany: vi.fn(), createMany: vi.fn() },
  userRoleAssignment: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
}

const syncServiceCommitteeMembers = vi.fn()
vi.mock('~/shared/domain/service-committee.server', () => ({ syncServiceCommitteeMembers }))

const { adoptServiceCommittee, proposeCommitteeAdoption } = await import('./organigram-adoption.server')
const { ForbiddenError } = await import('~/shared/errors/app-error.server')

const CONGREGATION = 10
const ACTOR = 99

// The built-in rows the migration created, unplaced.
const BUILT_IN = [
  { id: 1, key: 'elder', name: null, parentRoleId: null },
  { id: 2, key: 'service-committee', name: null, parentRoleId: null },
  { id: 3, key: 'coordinator', name: null, parentRoleId: null },
  { id: 4, key: 'secretary', name: null, parentRoleId: null },
  { id: 5, key: 'service-overseer', name: null, parentRoleId: null },
]

/** What an existing congregation actually has: its own French roles, already in the chart. */
const EXISTING = [
  { id: 20, key: 'comite-de-service', name: 'Comité de service', parentRoleId: 1, showInOrganigram: true },
  { id: 21, key: 'coordinateur', name: 'Coordinateur', parentRoleId: 20, showInOrganigram: true },
  {
    id: 22,
    key: 'responsable-pour-la-predication',
    name: 'Responsable pour la prédication',
    parentRoleId: 20,
    showInOrganigram: true,
  },
  { id: 23, key: 'sono', name: 'Sono', parentRoleId: 21, showInOrganigram: true },
]

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.role.findMany.mockResolvedValue([...BUILT_IN, ...EXISTING])
  mockDb.rolePermission.findMany.mockResolvedValue([])
  mockDb.userRoleAssignment.findMany.mockResolvedValue([])
  mockDb.role.update.mockResolvedValue({})
  mockDb.role.updateMany.mockResolvedValue({ count: 0 })
  mockDb.rolePermission.createMany.mockResolvedValue({ count: 0 })
  mockDb.userRoleAssignment.create.mockResolvedValue({})
  mockDb.userRoleAssignment.deleteMany.mockResolvedValue({ count: 0 })
})

describe('proposeCommitteeAdoption', () => {
  it('suggests the congregation’s own role for each post', async () => {
    const proposal = await proposeCommitteeAdoption(mockDb as never, CONGREGATION)

    const byKey = new Map(proposal.posts.map(post => [post.key, post]))
    expect(byKey.get('service-committee')?.suggestedRoleId).toBe(20)
    expect(byKey.get('coordinator')?.suggestedRoleId).toBe(21)
    // «Responsable pour la prédication» is what a French congregation calls the service overseer.
    expect(byKey.get('service-overseer')?.suggestedRoleId).toBe(22)
  })

  it('suggests nothing for a post the congregation never created', async () => {
    // The demo has no secretary at all — a guess here would be worse than none.
    const proposal = await proposeCommitteeAdoption(mockDb as never, CONGREGATION)

    expect(proposal.posts.find(post => post.key === 'secretary')?.suggestedRoleId).toBeNull()
  })

  it('offers every chart node as an alternative, so a wrong guess can be overridden', async () => {
    const proposal = await proposeCommitteeAdoption(mockDb as never, CONGREGATION)

    const candidateIds = proposal.candidates.map(candidate => candidate.id)
    expect(candidateIds).toEqual(expect.arrayContaining([20, 21, 22, 23]))
    // Never the built-in posts themselves — mapping one onto another is meaningless.
    expect(candidateIds).not.toContain(3)
  })

  it('reports that adoption is already done once the committee is placed', async () => {
    mockDb.role.findMany.mockResolvedValue([
      { id: 2, key: 'service-committee', name: null, parentRoleId: 1, showInOrganigram: true },
    ])

    const proposal = await proposeCommitteeAdoption(mockDb as never, CONGREGATION)

    expect(proposal.alreadyAdopted).toBe(true)
  })
})

describe('adoptServiceCommittee', () => {
  it('places the committee under the elders and the posts inside it', async () => {
    await adoptServiceCommittee(mockDb as never, [], CONGREGATION, ACTOR)

    const placed = mockDb.role.update.mock.calls.map(([arg]) => ({
      id: arg.where.id_congregationId.id,
      parentRoleId: arg.data.parentRoleId,
      shown: arg.data.showInOrganigram,
    }))
    expect(placed).toEqual(
      expect.arrayContaining([
        { id: 2, parentRoleId: 1, shown: true },
        { id: 3, parentRoleId: 2, shown: true },
        { id: 4, parentRoleId: 2, shown: true },
        { id: 5, parentRoleId: 2, shown: true },
      ]),
    )
  })

  it('moves the mapped role’s holder onto the post', async () => {
    mockDb.userRoleAssignment.findMany.mockResolvedValue([{ userId: 800, roleId: 21, kind: 'leader' }])

    await adoptServiceCommittee(mockDb as never, [{ postKey: 'coordinator', fromRoleId: 21 }], CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 800, roleId: 3, kind: 'leader' }) }),
    )
    expect(mockDb.userRoleAssignment.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 800, roleId: 21 }) }),
    )
  })

  it('copies the mapped role’s permissions rather than moving them', async () => {
    // The old role may still gate part eligibility or be assigned elsewhere. Moving a permission
    // off it would silently revoke access that has nothing to do with the organigram.
    mockDb.rolePermission.findMany.mockResolvedValue([{ permissionId: 77 }])

    await adoptServiceCommittee(mockDb as never, [{ postKey: 'coordinator', fromRoleId: 21 }], CONGREGATION, ACTOR)

    expect(mockDb.rolePermission.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ roleId: 3, permissionId: 77, congregationId: CONGREGATION }],
        skipDuplicates: true,
      }),
    )
  })

  it('re-hangs the services that reported to the mapped role', async () => {
    await adoptServiceCommittee(mockDb as never, [{ postKey: 'coordinator', fromRoleId: 21 }], CONGREGATION, ACTOR)

    // «Sono» reported to the old «Coordinateur»; it must now report to the post.
    expect(mockDb.role.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ parentRoleId: 21 }),
        data: { parentRoleId: 3 },
      }),
    )
  })

  it('takes the mapped role out of the chart without deleting it', async () => {
    await adoptServiceCommittee(mockDb as never, [{ postKey: 'coordinator', fromRoleId: 21 }], CONGREGATION, ACTOR)

    const unflagged = mockDb.role.update.mock.calls
      .map(([arg]) => arg)
      .find(arg => arg.where.id_congregationId.id === 21)
    expect(unflagged?.data.showInOrganigram).toBe(false)
  })

  it('refuses to map a built-in post onto another', async () => {
    await expect(
      adoptServiceCommittee(mockDb as never, [{ postKey: 'coordinator', fromRoleId: 4 }], CONGREGATION, ACTOR),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('does not seat anyone on the committee itself', async () => {
    // The committee's membership is derived from its three posts, so a holder moved onto it here
    // would be reconciled straight back off — a change the admin would watch undo itself.
    mockDb.userRoleAssignment.findMany.mockResolvedValue([{ userId: 800, roleId: 20, kind: 'leader' }])

    await adoptServiceCommittee(
      mockDb as never,
      [{ postKey: 'service-committee', fromRoleId: 20 }],
      CONGREGATION,
      ACTOR,
    )

    expect(mockDb.userRoleAssignment.create).not.toHaveBeenCalled()
    // Its permissions and its children still come across.
    expect(mockDb.role.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ parentRoleId: 20 }) }),
    )
  })

  it('reconciles the committee once the posts are filled', async () => {
    await adoptServiceCommittee(mockDb as never, [{ postKey: 'coordinator', fromRoleId: 21 }], CONGREGATION, ACTOR)

    expect(syncServiceCommitteeMembers).toHaveBeenCalledWith(mockDb, CONGREGATION, ACTOR)
  })

  it('leaves an unmapped post empty rather than guessing', async () => {
    await adoptServiceCommittee(mockDb as never, [{ postKey: 'coordinator', fromRoleId: null }], CONGREGATION, ACTOR)

    expect(mockDb.userRoleAssignment.create).not.toHaveBeenCalled()
    expect(mockDb.rolePermission.createMany).not.toHaveBeenCalled()
  })
})
