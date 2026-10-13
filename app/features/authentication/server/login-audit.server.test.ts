import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { userAccount: { findFirst: vi.fn() } },
}))

const { resolveLoginAuditCongregationId } = await import('./login-audit.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const MARC = { id: 7, email: 'marc@example.org', congregationId: 3 }

// Answers the account lookup the way the table would: the row with that id or that email, or nothing.
function mockAccounts(rows: (typeof MARC)[]) {
  vi.mocked(db.userAccount.findFirst).mockImplementation(((args: { where: { id?: number; email?: string } }) =>
    Promise.resolve(
      rows.find(row => (args.where.id != null ? row.id === args.where.id : row.email === args.where.email)) ?? null,
    )) as never)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('resolveLoginAuditCongregationId', () => {
  it('attributes the event to the congregation the URL names', async () => {
    mockAccounts([MARC])

    await expect(resolveLoginAuditCongregationId(12, { id: MARC.id })).resolves.toBe(12)
  })

  // Regression: a host that names no congregation recorded no sign-in at all. That is every
  // single-tenant instance, and the base domain of a multi-tenant one.
  it("falls back to the account's own congregation when the URL names none", async () => {
    mockAccounts([MARC])

    await expect(resolveLoginAuditCongregationId(undefined, { id: MARC.id })).resolves.toBe(3)
  })

  it('finds the account behind a failed attempt by the email that was typed, whatever its case', async () => {
    mockAccounts([MARC])

    await expect(resolveLoginAuditCongregationId(undefined, { email: 'Marc@Example.org' })).resolves.toBe(3)
  })

  it('has no congregation for an email no account uses, when the URL names none', async () => {
    mockAccounts([MARC])

    await expect(resolveLoginAuditCongregationId(undefined, { email: 'nobody@example.org' })).resolves.toBeNull()
  })
})
