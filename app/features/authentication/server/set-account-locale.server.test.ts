import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  AuditAction: { UserLocaleChanged: 'user.locale.changed' },
}))

const { setAccountLocale } = await import('./set-account-locale.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { audit } = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('setAccountLocale', () => {
  it('stores the locale the account chose for itself', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ locale: null } as never)

    await setAccountLocale(42, 7, 'en', 42)

    expect(db.userAccount.update).toHaveBeenCalledWith({
      where: { id: 42, congregationId: 7 },
      data: { locale: 'en' },
    })
  })

  it("clears it, so the account follows its congregation's again", async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ locale: 'en' } as never)

    await setAccountLocale(42, 7, null, 42)

    expect(db.userAccount.update).toHaveBeenCalledWith({
      where: { id: 42, congregationId: 7 },
      data: { locale: null },
    })
  })

  it('records the change with the locale it replaced', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ locale: 'fr' } as never)

    await setAccountLocale(42, 7, 'en', 42)

    expect(audit).toHaveBeenCalledWith({
      action: 'user.locale.changed',
      congregationId: 7,
      actorId: 42,
      entityType: 'User',
      entityId: 42,
      metadata: { from: 'fr', to: 'en' },
    })
  })

  it('reports whether anything changed', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ locale: 'en' } as never)
    await expect(setAccountLocale(42, 7, 'fr', 42)).resolves.toBe(true)

    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ locale: 'en' } as never)
    await expect(setAccountLocale(42, 7, 'en', 42)).resolves.toBe(false)
  })

  // Saving the form unchanged is not a change: no write, nothing in the audit trail.
  it('leaves an unchanged locale alone', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ locale: null } as never)

    await setAccountLocale(42, 7, null, 42)

    expect(db.userAccount.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  // The account is looked up in the congregation the session belongs to, never by its id alone.
  it('does nothing for an account outside the congregation', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(null as never)

    await expect(setAccountLocale(42, 7, 'en', 42)).resolves.toBe(false)

    expect(db.userAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 42, congregationId: 7 },
      select: { locale: true },
    })
    expect(db.userAccount.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
})
