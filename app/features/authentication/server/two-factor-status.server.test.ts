import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findFirst: vi.fn() },
  },
}))

const { isTwoFactorEnabled, getTwoFactorStatus } = await import('./two-factor-status.server')
const { unscopedDb } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('isTwoFactorEnabled', () => {
  it('returns true when the account has a confirmed enrollment', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({ twoFactorEnabledAt: new Date() } as never)

    expect(await isTwoFactorEnabled(7)).toBe(true)
  })

  it('returns false when enrollment is only pending (enabledAt null)', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({ twoFactorEnabledAt: null } as never)

    expect(await isTwoFactorEnabled(7)).toBe(false)
  })

  it('returns false when the account does not exist', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue(null as never)

    expect(await isTwoFactorEnabled(999)).toBe(false)
  })

  it('queries the account by id', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({ twoFactorEnabledAt: null } as never)

    await isTwoFactorEnabled(7)

    expect(vi.mocked(unscopedDb.userAccount.findFirst).mock.calls[0]?.[0]).toMatchObject({ where: { id: 7 } })
  })
})

describe('getTwoFactorStatus', () => {
  function fakeDb(account: unknown) {
    return { userAccount: { findFirst: vi.fn().mockResolvedValue(account) } } as never
  }

  it('reports enabled when the enrollment is confirmed', async () => {
    const db = fakeDb({ twoFactorSecret: 'enc', twoFactorEnabledAt: new Date() })

    expect(await getTwoFactorStatus(db, 7)).toEqual({ enabled: true, pending: false })
  })

  it('reports pending when a secret exists but is not yet confirmed', async () => {
    const db = fakeDb({ twoFactorSecret: 'enc', twoFactorEnabledAt: null })

    expect(await getTwoFactorStatus(db, 7)).toEqual({ enabled: false, pending: true })
  })

  it('reports neither when there is no secret', async () => {
    const db = fakeDb({ twoFactorSecret: null, twoFactorEnabledAt: null })

    expect(await getTwoFactorStatus(db, 7)).toEqual({ enabled: false, pending: false })
  })
})
