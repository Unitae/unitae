import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/auth/permissions.server', () => ({
  findNotificationRecipientsWithPermission: vi.fn(),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { findNotificationRecipientsWithPermission } from '~/shared/auth/permissions.server'
import { categoryWildcard, resolveRecipients } from './resolve-recipients.server'

const mockDb = {
  notificationPreference: { findMany: vi.fn() },
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.notificationPreference.findMany.mockResolvedValue([])
})

describe('resolveRecipients', () => {
  it('prefers the linked Member firstname over the UserAccount firstname', async () => {
    vi.mocked(findNotificationRecipientsWithPermission).mockResolvedValue([
      {
        id: 1,
        email: 'linked@test.org',
        firstname: 'AccountName',
        active: true,
        member: { firstname: 'MemberName' },
      },
      {
        id: 2,
        email: 'unlinked@test.org',
        firstname: 'AdminName',
        active: true,
        member: null,
      },
    ] as never)

    const recipients = await resolveRecipients(mockDb as never, 42, 'board-validator', 'board.document.created')

    expect(recipients).toEqual([
      { userId: 1, email: 'linked@test.org', firstname: 'MemberName' },
      { userId: 2, email: 'unlinked@test.org', firstname: 'AdminName' },
    ])
  })

  it('delegates recipient resolution to the notification-scoped finder so left members are excluded at the DB', async () => {
    vi.mocked(findNotificationRecipientsWithPermission).mockResolvedValue([] as never)

    await resolveRecipients(mockDb as never, 42, 'board-validator', 'board.document.created')

    // Route through findNotificationRecipientsWithPermission — not the
    // permission-only findAccountsWithPermission — so left / anonymized
    // members are gated at the WHERE. Passing the plain finder would
    // send emails to publishers who left the congregation.
    expect(findNotificationRecipientsWithPermission).toHaveBeenCalledWith(mockDb, 42, 'board-validator')
  })
})

describe('categoryWildcard', () => {
  it("extracts category from 'board.document.created' → 'board.*'", () => {
    expect(categoryWildcard('board.document.created')).toBe('board.*')
  })

  it("extracts category from 'attribution.created' → 'attribution.*'", () => {
    expect(categoryWildcard('attribution.created')).toBe('attribution.*')
  })

  it("appends '.*' when there is no dot — 'category' → 'category.*'", () => {
    expect(categoryWildcard('category')).toBe('category.*')
  })

  it("uses only the first segment for 'a.b.c.d' → 'a.*'", () => {
    expect(categoryWildcard('a.b.c.d')).toBe('a.*')
  })

  it("handles empty string → '.*'", () => {
    expect(categoryWildcard('')).toBe('.*')
  })

  it('already-wildcard type preserves only the first segment', () => {
    expect(categoryWildcard('board.*')).toBe('board.*')
  })
})
