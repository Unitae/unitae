import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/runtime', () => ({ getLocale: () => 'fr' }))

const { listUserAccounts } = await import('./user-accounts.queries')

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

  it('lists the account’s own roles and counts those its record gives', async () => {
    db.userAccount.findMany.mockResolvedValue([
      account({
        id: 2,
        memberId: 40,
        member: { firstname: 'Claire', lastname: 'André' },
        roleAssignments: [{ role: { id: 9, key: 'territories', name: 'Responsable des territoires' } }],
      }),
    ])
    db.memberRoleAssignment.findMany.mockResolvedValue([{ memberId: 40 }, { memberId: 40 }, { memberId: 40 }])

    const [row] = await listUserAccounts(db as never, 3, {})

    expect(row?.roles).toEqual([{ id: 9, key: 'territories', name: 'Responsable des territoires' }])
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
