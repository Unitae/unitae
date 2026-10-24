import { beforeEach, describe, expect, it, vi } from 'vitest'

// Only an admin may edit an admin's account (email, active), and the last admin cannot be
// deactivated. Accounts live in an in-memory store, so the tests assert on what was written.

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: { UserUpdated: 'UserUpdated' }, audit: vi.fn() }))
vi.mock('~/features/publishers/index.server', () => ({ memberAggregate: { updateAccountName: vi.fn() } }))

const { adminIds } = vi.hoisted(() => ({ adminIds: new Set<number>() }))

vi.mock('~/shared/auth/permissions.server', async () => {
  const { ConflictError } = await import('~/shared/errors/app-error.server')
  return {
    isAccountAdmin: vi.fn(async (accountId: number) => adminIds.has(accountId)),
    requireNotLastAdmin: vi.fn(async (accountId: number) => {
      if (adminIds.has(accountId) && adminIds.size === 1) throw new ConflictError('last admin')
    }),
  }
})

const accounts = new Map<number, { email: string; active: boolean }>()
const db = {
  userAccount: {
    findUnique: vi.fn(async ({ where }: { where: { id_congregationId: { id: number } } }) =>
      accounts.has(where.id_congregationId.id)
        ? { memberId: null, active: accounts.get(where.id_congregationId.id)?.active }
        : null,
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id_congregationId: { id: number } }
        data: { email: string; active: boolean }
      }) => {
        accounts.set(where.id_congregationId.id, { email: data.email, active: data.active })
      },
    ),
  },
}

const { updateAccount } = await import('./update-account.server')
const { ConflictError, ForbiddenError } = await import('~/shared/errors/app-error.server')

const USER_MANAGER = new Set(['can-manage-users'])
const ADMIN = new Set(['can-do-anything'])
const edit = (email: string, active = true) => ({ firstname: 'A', lastname: 'B', email, active })

beforeEach(() => {
  accounts.clear()
  adminIds.clear()
  accounts.set(1, { email: 'admin@example.com', active: true })
  accounts.set(2, { email: 'second@example.com', active: true })
  accounts.set(5, { email: 'member@example.com', active: true })
})

describe('updateAccount guards', () => {
  it("refuses to change an admin's email to an actor who is not an admin", async () => {
    adminIds.add(1)
    await expect(
      updateAccount(db as never, 1, 10, 7, edit('mallory@example.com'), USER_MANAGER),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(accounts.get(1)?.email).toBe('admin@example.com')
  })

  it("lets an admin edit another admin's account", async () => {
    adminIds.add(1)
    adminIds.add(2)
    await updateAccount(db as never, 1, 10, 2, edit('new-admin@example.com'), ADMIN)
    expect(accounts.get(1)?.email).toBe('new-admin@example.com')
  })

  it('lets a user manager edit a non-admin account', async () => {
    await updateAccount(db as never, 5, 10, 7, edit('renamed@example.com'), USER_MANAGER)
    expect(accounts.get(5)?.email).toBe('renamed@example.com')
  })

  it('refuses to deactivate the last admin', async () => {
    adminIds.add(1)
    await expect(updateAccount(db as never, 1, 10, 1, edit('admin@example.com', false), ADMIN)).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(accounts.get(1)?.active).toBe(true)
  })
})
