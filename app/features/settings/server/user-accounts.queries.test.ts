import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAccountPage, listUserAccounts } = await import('./user-accounts.queries')

const db = { userAccount: { findMany: vi.fn() }, memberRoleAssignment: { findMany: vi.fn() } }

const account = (overrides: Record<string, unknown>) => ({
  id: 1,
  email: 'a@example.org',
  firstname: null,
  lastname: null,
  active: true,
  anonymizedAt: null,
  password: 'scrypt$131072$8$1$c2FsdA$a2V5',
  twoFactorEnabledAt: null,
  memberId: null,
  member: null,
  roleAssignments: [],
  ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
  db.memberRoleAssignment.findMany.mockResolvedValue([])
})

describe('listUserAccounts', () => {
  it('names a linked account after its record, and sorts everyone by that name', async () => {
    db.userAccount.findMany.mockResolvedValue([
      account({ id: 1, firstname: 'Zoé', lastname: 'Zéro' }),
      account({ id: 2, memberId: 40, member: { firstname: 'Claire', lastname: 'André' } }),
      account({ id: 3, firstname: 'Émile', lastname: 'Bertin' }),
    ])

    const rows = await listUserAccounts(db as never, 3, {})

    expect(rows.map(row => [row.id, row.firstname, row.lastname])).toEqual([
      [2, 'Claire', 'André'],
      [3, 'Émile', 'Bertin'],
      [1, 'Zoé', 'Zéro'],
    ])
  })

  it('tells each account’s state and whether two-step verification is on', async () => {
    db.userAccount.findMany.mockResolvedValue([
      account({ id: 1, lastname: 'A', password: 'password' }),
      account({ id: 2, lastname: 'B', active: false }),
      account({ id: 3, lastname: 'C', twoFactorEnabledAt: new Date('2026-03-03') }),
    ])

    const rows = await listUserAccounts(db as never, 3, {})

    expect(rows.map(row => [row.status, row.twoFactor])).toEqual([
      ['invited', false],
      ['deactivated', false],
      ['active', true],
    ])
    expect(rows[0]).not.toHaveProperty('password')
  })

  it('lists the roles given to the person, on the record or the login, and counts the identity ones', async () => {
    db.userAccount.findMany.mockResolvedValue([
      account({
        id: 2,
        memberId: 40,
        member: {
          firstname: 'Claire',
          lastname: 'André',
          roleAssignments: [
            { role: { id: 20, key: 'publisher', name: null } },
            { role: { id: 21, key: 'sister', name: null } },
            { role: { id: 22, key: 'member', name: null } },
            { role: { id: 10, key: 'sono', name: 'Sonorisation' } },
          ],
        },
        roleAssignments: [{ role: { id: 9, key: 'territories', name: 'Responsable des territoires' } }],
      }),
    ])

    const [row] = await listUserAccounts(db as never, 3, {})

    expect(row?.roles).toEqual([
      { id: 9, key: 'territories', name: 'Responsable des territoires' },
      { id: 10, key: 'sono', name: 'Sonorisation' },
    ])
    expect(row?.recordRoleCount).toBe(3)
  })

  it('looks the search up in the account’s and the record’s names and in the e-mail', async () => {
    db.userAccount.findMany.mockResolvedValue([])

    await listUserAccounts(db as never, 3, { search: 'andr' })

    const where = db.userAccount.findMany.mock.calls[0]?.[0]?.where
    expect(where.congregationId).toBe(3)
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { email: { contains: 'andr', mode: 'insensitive' } },
        { member: { lastname: { contains: 'andr', mode: 'insensitive' } } },
      ]),
    )
  })
})

describe('getAccountPage', () => {
  const pageDb = { userAccount: { findFirst: vi.fn() }, role: { findMany: vi.fn() } }
  const ROLES = [
    {
      id: 3,
      key: 'speakers',
      name: 'Orateurs',
      description: null,
      isSinglePerson: false,
      isBuiltIn: false,
      permissions: [{ permission: { key: 'can-view-programs' } }],
      members: [{ user: { firstname: null, lastname: null, member: { firstname: 'Claire', lastname: 'André' } } }],
      memberAssignments: [],
    },
    {
      id: 1,
      key: 'admin',
      name: null,
      description: null,
      isSinglePerson: false,
      isBuiltIn: true,
      permissions: [{ permission: { key: 'can-do-anything' } }],
      members: [{ user: { firstname: 'Marc', lastname: 'Dupont', member: null } }],
      memberAssignments: [],
    },
    {
      id: 7,
      key: 'av',
      name: 'Responsable audio/vidéo',
      description: null,
      isSinglePerson: true,
      isBuiltIn: false,
      permissions: [],
      members: [],
      memberAssignments: [{ member: { firstname: 'Claire', lastname: 'André' } }],
    },
    {
      id: 8,
      key: 'secretary',
      name: null,
      description: null,
      isSinglePerson: true,
      isBuiltIn: true,
      permissions: [],
      members: [{ user: { firstname: null, lastname: null, member: { firstname: 'Jean', lastname: 'Bernard' } } }],
      memberAssignments: [],
    },
    {
      id: 20,
      key: 'publisher',
      name: null,
      description: null,
      isSinglePerson: false,
      isBuiltIn: true,
      permissions: [],
      members: [],
      memberAssignments: [],
    },
  ]

  beforeEach(() => {
    pageDb.role.findMany.mockResolvedValue(ROLES)
    pageDb.userAccount.findFirst.mockResolvedValue({
      ...account({ id: 9, memberId: 40, member: { firstname: 'Claire', lastname: 'André' } }),
      member: {
        firstname: 'Claire',
        lastname: 'André',
        roleAssignments: [
          { role: { id: 20, key: 'publisher', name: null } },
          { role: { id: 7, key: 'av', name: 'Responsable audio/vidéo' } },
        ],
      },
      roleAssignments: [{ roleId: 3 }],
    })
  })

  it('is null for an account outside the congregation', async () => {
    pageDb.userAccount.findFirst.mockResolvedValue(null)

    expect(await getAccountPage(pageDb as never, 9, 3, new Set())).toBeNull()
  })

  it('lists the roles in order, the administrator first, saying which the account holds', async () => {
    const page = await getAccountPage(pageDb as never, 9, 3, new Set(['can-do-anything']))

    // `speakers` is held on the login, `av` on the record: both are the person's.
    expect(page?.roles.map(role => [role.key, role.assigned])).toEqual([
      ['admin', false],
      ['speakers', true],
      ['av', true],
      ['secretary', false],
    ])
    expect(page?.roles.find(role => role.key === 'av')?.holders).toEqual(['Claire ANDRÉ'])
    expect(page?.roles.find(role => role.key === 'secretary')?.holders).toEqual(['Jean BERNARD'])
    expect(page?.roles.find(role => role.key === 'speakers')?.holderCount).toBe(1)
  })

  it('offers only the roles whose rights the viewer holds, and the administrator to administrators', async () => {
    const page = await getAccountPage(pageDb as never, 9, 3, new Set(['can-manage-users', 'can-view-programs']))

    expect(page?.roles.map(role => [role.key, role.grantable])).toEqual([
      ['admin', false],
      ['speakers', true],
      ['av', false],
      ['secretary', false],
    ])
  })

  it('names the roles its record gives, the identity ones only', async () => {
    const page = await getAccountPage(pageDb as never, 9, 3, new Set())

    expect(page?.recordRoles).toEqual([{ id: 20, key: 'publisher', name: null }])
  })
})
