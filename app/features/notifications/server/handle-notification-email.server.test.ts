import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Pipeline-level tests: assert handleInstantEmail resolves recipients, looks up
// user records with `member` firstname, and calls mailer.emails.send with a
// non-null react element and the expected to/from/subject.
//
// "Which template renders for which type" is covered by the per-feature manifest
// tests (features/{feature}/server/notifications.server.test.ts) and the
// registry-wide contract test — no need to re-assert component identity here.

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findFirst: vi.fn() },
    notificationEvent: { updateMany: vi.fn() },
  },
}))

vi.mock('~/shared/domain/congregation.server', () => ({
  resolveCongregation: vi.fn(),
}))

vi.mock('~/shared/infra/mailer.server', () => ({
  mailer: { emails: { send: vi.fn() } },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('~/shared/utils/worker-locale.server', () => ({
  runInWorkerContext: (_locale: string, _timezone: string, fn: () => Promise<unknown>) => fn(),
}))

vi.mock('./resolve-recipients.server', () => ({
  resolveRecipients: vi.fn(),
}))

const { handleInstantEmail } = await import('./handle-notification-email.server')
const { unscopedDb } = await import('~/shared/infra/db.server')
const { resolveCongregation } = await import('~/shared/domain/congregation.server')
const { mailer } = await import('~/shared/infra/mailer.server')
const { resolveRecipients } = await import('./resolve-recipients.server')

const CONGREGATION = {
  id: 42,
  emailFrom: 'Assembly <noreply@test.org>',
  baseUrl: 'https://test.org',
  displayName: 'Test Assembly',
  locale: 'en',
  timezone: 'UTC',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(resolveCongregation).mockResolvedValue(CONGREGATION as never)
})

describe('handleInstantEmail — recipientId branch (targets a specific user)', () => {
  it('looks up the user with member.firstname included and sends to their email', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({
      id: 7,
      email: 'user@test.org',
      firstname: 'AccountName',
      member: null,
    } as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'territory.sync.completed',
      recipientId: 7,
      recipientRole: null,
      payload: '{}',
    })

    // The query MUST include member so displayFirstname can resolve.
    expect(unscopedDb.userAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ member: { select: { firstname: true } } }),
      }),
    )
    expect(mailer.emails.send).toHaveBeenCalledTimes(1)
    const sent = vi.mocked(mailer.emails.send).mock.calls[0][0] as {
      to: string
      from: string
      subject: string
      react: ReactElement
    }
    expect(sent.to).toBe('user@test.org')
    expect(sent.from).toBe(CONGREGATION.emailFrom)
    expect(sent.subject).toBeTruthy()
    expect(sent.react).toBeTruthy()
  })

  it('prefers linked Member firstname when passing to the renderer', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({
      id: 7,
      email: 'user@test.org',
      firstname: 'AccountName',
      member: { firstname: 'MemberName' },
    } as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'territory.sync.completed',
      recipientId: 7,
      recipientRole: null,
      payload: '{}',
    })

    // The rendered react element should carry the Member firstname, not the
    // UserAccount one. Assert on the outgoing props at whatever depth the
    // template exposes them.
    const sent = vi.mocked(mailer.emails.send).mock.calls[0][0] as { react: ReactElement }
    const jsonProps = JSON.stringify(sent.react.props)
    expect(jsonProps).toContain('MemberName')
    expect(jsonProps).not.toContain('AccountName')
  })
})

describe('handleInstantEmail — recipientRole branch (targets everyone with a permission)', () => {
  it('resolves recipients and sends one email per person', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([
      { userId: 1, email: 'a@test.org', firstname: 'Alice' },
      { userId: 2, email: 'b@test.org', firstname: null },
    ] as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'board.document.deleted',
      recipientId: null,
      recipientRole: 'board-validator',
      payload: JSON.stringify({ title: 'Removed doc' }),
    })

    expect(mailer.emails.send).toHaveBeenCalledTimes(2)
    const firstTo = (vi.mocked(mailer.emails.send).mock.calls[0][0] as { to: string }).to
    const secondTo = (vi.mocked(mailer.emails.send).mock.calls[1][0] as { to: string }).to
    expect([firstTo, secondTo]).toEqual(['a@test.org', 'b@test.org'])
  })

  it('sends nothing when the payload fails schema validation', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([{ userId: 1, email: 'a@test.org', firstname: 'Alice' }] as never)

    // board.document.expiring requires a non-empty documents array
    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'board.document.expiring',
      recipientId: null,
      recipientRole: 'board-validator',
      payload: JSON.stringify({ documents: [] }),
    })

    expect(mailer.emails.send).not.toHaveBeenCalled()
  })
})
