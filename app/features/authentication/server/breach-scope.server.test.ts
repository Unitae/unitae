import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

vi.mock('~/shared/auth/permissions.server', () => ({
  resolveEffectivePermissions: vi.fn(),
}))

const { isAccountInBreachScope } = await import('./breach-scope.server')
const { resolveEffectivePermissions } = await import('~/shared/auth/permissions.server')

const settingFindFirst = vi.fn()
const userAccountFindFirst = vi.fn()

const db = {
  setting: { findFirst: settingFindFirst },
  userAccount: { findFirst: userAccountFindFirst },
} as unknown as TransactionClient

const USER_ID = 4242
const CONGREGATION_ID = 77

function withScopeSetting(value: string | null) {
  settingFindFirst.mockResolvedValue(value == null ? null : { value })
}

function withMemberFlags(flags: { isHelder?: boolean; isServant?: boolean } | null) {
  userAccountFindFirst.mockResolvedValue(flags == null ? { member: null } : { member: flags })
}

function withPermissions(...perms: Permission[]) {
  vi.mocked(resolveEffectivePermissions).mockResolvedValue(new Set(perms))
}

beforeEach(() => {
  vi.resetAllMocks()
  withMemberFlags(null)
  withPermissions()
})

describe('isAccountInBreachScope', () => {
  it('returns false when the policy is unset', async () => {
    withScopeSetting(null)

    expect(await isAccountInBreachScope(db, USER_ID, CONGREGATION_ID)).toBe(false)
  })

  it('returns false when the policy is off', async () => {
    withScopeSetting('off')

    expect(await isAccountInBreachScope(db, USER_ID, CONGREGATION_ID)).toBe(false)
  })

  it('returns false (fail-closed) for an unrecognized/legacy policy value', async () => {
    withScopeSetting('Responsibilities ') // wrong case + trailing space

    expect(await isAccountInBreachScope(db, USER_ID, CONGREGATION_ID)).toBe(false)
  })

  it('returns true for every account when the policy is everyone', async () => {
    withScopeSetting('everyone')

    expect(await isAccountInBreachScope(db, USER_ID, CONGREGATION_ID)).toBe(true)
  })

  describe('when the policy is responsibilities', () => {
    beforeEach(() => withScopeSetting('responsibilities'))

    it('includes an elder (isHelder) with no app permissions', async () => {
      withMemberFlags({ isHelder: true })
      withPermissions()

      expect(await isAccountInBreachScope(db, USER_ID, CONGREGATION_ID)).toBe(true)
    })

    it('includes a ministerial servant (isServant)', async () => {
      withMemberFlags({ isServant: true })
      withPermissions()

      expect(await isAccountInBreachScope(db, USER_ID, CONGREGATION_ID)).toBe(true)
    })

    it('includes an account with a management permission but no appointment', async () => {
      withMemberFlags(null)
      withPermissions(Permission.PublisherManager)

      expect(await isAccountInBreachScope(db, USER_ID, CONGREGATION_ID)).toBe(true)
    })

    it('includes an admin', async () => {
      withMemberFlags(null)
      withPermissions(Permission.Admin)

      expect(await isAccountInBreachScope(db, USER_ID, CONGREGATION_ID)).toBe(true)
    })

    it('excludes a plain publisher (no appointment, only viewer access)', async () => {
      withMemberFlags({ isHelder: false, isServant: false })
      withPermissions(Permission.BoardViewer, Permission.PublisherViewer)

      expect(await isAccountInBreachScope(db, USER_ID, CONGREGATION_ID)).toBe(false)
    })

    it('excludes an account with no linked member and no management access', async () => {
      withMemberFlags(null)
      withPermissions(Permission.BoardViewer)

      expect(await isAccountInBreachScope(db, USER_ID, CONGREGATION_ID)).toBe(false)
    })

    it('excludes when the account row is not found', async () => {
      userAccountFindFirst.mockResolvedValue(null)
      withPermissions()

      expect(await isAccountInBreachScope(db, USER_ID, CONGREGATION_ID)).toBe(false)
    })
  })
})
