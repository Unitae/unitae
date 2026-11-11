import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountId } from '~/shared/types/branded'

vi.mock('~/features/authentication/index.server', () => ({ disableTwoFactor: vi.fn() }))
vi.mock('~/shared/auth/permissions.server', () => ({ isAccountAdmin: vi.fn() }))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: { TwoFactorReset: 'two_factor.reset' }, audit: vi.fn() }))

const { disableTwoFactor } = await import('~/features/authentication/index.server')
const { isAccountAdmin } = await import('~/shared/auth/permissions.server')
const { audit } = await import('~/shared/domain/audit.server')
const { resetAccountTwoFactor } = await import('./reset-account-two-factor.server')
const { ForbiddenError, NotFoundError } = await import('~/shared/errors/app-error.server')

const db = { userAccount: { findFirst: vi.fn() } }
const MANAGER = new Set(['can-manage-users'])
const ADMIN = new Set(['can-do-anything'])

beforeEach(() => {
  vi.resetAllMocks()
  db.userAccount.findFirst.mockResolvedValue({ id: 5, email: 'claire@example.org' })
  vi.mocked(isAccountAdmin).mockResolvedValue(false)
})

describe('resetAccountTwoFactor', () => {
  it('turns the account’s two-step verification off and says so in the audit log', async () => {
    const account = await resetAccountTwoFactor(db as never, 5 as AccountId, 3, 7, MANAGER)

    expect(account).toEqual({ id: 5, email: 'claire@example.org' })
    expect(disableTwoFactor).toHaveBeenCalledWith(db, 5)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'two_factor.reset', congregationId: 3, actorId: 7, entityId: 5 }),
    )
  })

  it('keeps an administrator’s verification to administrators', async () => {
    vi.mocked(isAccountAdmin).mockResolvedValue(true)

    await expect(resetAccountTwoFactor(db as never, 5 as AccountId, 3, 7, MANAGER)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(disableTwoFactor).not.toHaveBeenCalled()
    await expect(resetAccountTwoFactor(db as never, 5 as AccountId, 3, 7, ADMIN)).resolves.toBeDefined()
  })

  it('finds only an account of the congregation', async () => {
    db.userAccount.findFirst.mockResolvedValue(null)

    await expect(resetAccountTwoFactor(db as never, 5 as AccountId, 3, 7, ADMIN)).rejects.toBeInstanceOf(NotFoundError)
    expect(db.userAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 5, congregationId: 3 },
      select: { id: true, email: true },
    })
  })
})
