import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

vi.mock('~/shared/auth/permissions.server', () => ({ isAccountAdmin: vi.fn() }))

const { isAccountAdmin } = await import('~/shared/auth/permissions.server')
const { assertMayActOnAccount, OwnAccountError } = await import('./account-protection.server')
const { GrantBeyondActorError } = await import('./role-grant-limits.server')

const MANAGER = new Set<string>([Permission.CanManageUsers])
const ADMIN = new Set<string>([Permission.CanDoAnything])
const base = { congregationId: 3, actorId: 7 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isAccountAdmin).mockResolvedValue(false)
})

describe('assertMayActOnAccount', () => {
  it.each(['deactivate', 'remove-roles', 'anonymise', 'delete'] as const)(
    'refuses to %s the actor’s own account, even for an administrator',
    async action => {
      await expect(
        assertMayActOnAccount({ ...base, accountId: 7, actorPermissions: ADMIN, action }),
      ).rejects.toBeInstanceOf(OwnAccountError)
    },
  )

  it('lets the actor edit their own account or send themselves a password link', async () => {
    await expect(
      assertMayActOnAccount({ ...base, accountId: 7, actorPermissions: MANAGER, action: 'edit' }),
    ).resolves.toBeUndefined()
    await expect(
      assertMayActOnAccount({ ...base, accountId: 7, actorPermissions: MANAGER, action: 'send-password-link' }),
    ).resolves.toBeUndefined()
  })

  it.each(['edit', 'reset-two-factor', 'send-password-link', 'anonymise', 'delete'] as const)(
    'keeps an administrator’s account to administrators (%s)',
    async action => {
      vi.mocked(isAccountAdmin).mockResolvedValue(true)

      await expect(
        assertMayActOnAccount({ ...base, accountId: 12, actorPermissions: MANAGER, action }),
      ).rejects.toBeInstanceOf(GrantBeyondActorError)
      await expect(
        assertMayActOnAccount({ ...base, accountId: 12, actorPermissions: ADMIN, action }),
      ).resolves.toBeUndefined()
    },
  )

  it('lets a user manager act on an account that is not an administrator’s', async () => {
    await expect(
      assertMayActOnAccount({ ...base, accountId: 12, actorPermissions: MANAGER, action: 'reset-two-factor' }),
    ).resolves.toBeUndefined()
  })
})
