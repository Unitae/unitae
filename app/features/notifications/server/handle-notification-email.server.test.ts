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

const { handleDigestEmail, handleInstantEmail } = await import('./handle-notification-email.server')
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

describe('handleInstantEmail — SMTP failures (transient)', () => {
  it('does not propagate a mailer.emails.send throw — logs and returns', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({
      id: 7,
      email: 'user@test.org',
      firstname: 'Jean',
      member: null,
    } as never)
    vi.mocked(mailer.emails.send).mockRejectedValue(new Error('SMTP 550: mailbox full'))

    // Transient SMTP errors are caught inside sendNotificationToUser so BullMQ
    // retries the whole job on backoff — but the immediate call resolves.
    await expect(
      handleInstantEmail({
        type: 'notification-instant',
        congregationId: 42,
        notificationType: 'territory.sync.completed',
        recipientId: 7,
        recipientRole: null,
        payload: '{}',
      }),
    ).resolves.not.toThrow()
  })
})

describe('handleDigestEmail — success / failure partitioning', () => {
  it('marks nothing failed when every event renders (flush already marked them sent)', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([{ userId: 1, email: 'a@test.org', firstname: 'Alice' }] as never)

    await handleDigestEmail({
      type: 'notification-digest',
      congregationId: 42,
      recipientId: 0,
      events: [
        {
          type: 'board.document.created',
          entityType: 'BoardDocument',
          entityId: 100,
          payload: JSON.stringify({ title: 'Doc A', documentId: 100 }),
        },
        {
          type: 'board.document.created',
          entityType: 'BoardDocument',
          entityId: 200,
          payload: JSON.stringify({ title: 'Doc B', documentId: 200 }),
        },
      ],
      notificationEventIds: [11, 22],
    })

    // Both events rendered → no failed-marking; the redundant `sent` re-mark
    // was removed (flush-settled already handles the sent transition).
    expect(unscopedDb.notificationEvent.updateMany).not.toHaveBeenCalled()
    expect(mailer.emails.send).toHaveBeenCalledTimes(2)
  })

  it('marks only the specific event IDs whose render failed as failed', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([{ userId: 1, email: 'a@test.org', firstname: 'Alice' }] as never)

    await handleDigestEmail({
      type: 'notification-digest',
      congregationId: 42,
      recipientId: 0,
      events: [
        {
          type: 'board.document.created',
          entityType: 'BoardDocument',
          entityId: 100,
          payload: JSON.stringify({ title: 'Doc A', documentId: 100 }),
        },
        {
          type: 'board.document.created',
          entityType: 'BoardDocument',
          entityId: 200,
          payload: JSON.stringify({ /* missing documentId — schema fails */ title: 'Doc B' }),
        },
        {
          type: 'unregistered.type',
          entityType: 'Nothing',
          entityId: 300,
          payload: '{}',
        },
      ],
      notificationEventIds: [11, 22, 33],
    })

    // Events 22 (bad payload) and 33 (unregistered) should be recorded as failed;
    // event 11 stays `sent` (from flush-settled).
    expect(unscopedDb.notificationEvent.updateMany).toHaveBeenCalledTimes(1)
    expect(unscopedDb.notificationEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [22, 33] } },
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
    // Only the valid event's mail was sent.
    expect(mailer.emails.send).toHaveBeenCalledTimes(1)
  })

  it('does not touch the DB when events is empty', async () => {
    await handleDigestEmail({
      type: 'notification-digest',
      congregationId: 42,
      recipientId: 0,
      events: [],
      notificationEventIds: [],
    })

    expect(unscopedDb.notificationEvent.updateMany).not.toHaveBeenCalled()
    expect(mailer.emails.send).not.toHaveBeenCalled()
  })
})
