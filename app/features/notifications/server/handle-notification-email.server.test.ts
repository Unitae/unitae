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
    notificationPreference: { findFirst: vi.fn() },
  },
}))

vi.mock('~/shared/domain/congregation.server', () => ({
  resolveCongregation: vi.fn(),
}))

vi.mock('~/shared/infra/mailer.server', () => ({
  mailer: { emails: { send: vi.fn() } },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('~/shared/utils/worker-locale.server', () => ({
  // Spy that still passes through, so tests can assert whether the handler
  // even reached the worker context (used by the suspension-ordering test).
  runInWorkerContext: vi.fn((_locale: string, _timezone: string, fn: () => Promise<unknown>) => fn()),
}))

vi.mock('./resolve-recipients.server', async () => {
  const actual = await vi.importActual<typeof import('./resolve-recipients.server')>('./resolve-recipients.server')
  return {
    ...actual,
    resolveRecipients: vi.fn(),
    // Keep the real isNotificationDisabledForUser so the mocked
    // notificationPreference.findFirst above drives the branch under test.
  }
})

const { handleDigestEmail, handleInstantEmail } = await import('./handle-notification-email.server')
const { unscopedDb } = await import('~/shared/infra/db.server')
const { resolveCongregation } = await import('~/shared/domain/congregation.server')
const { mailer } = await import('~/shared/infra/mailer.server')
const { resolveRecipients } = await import('./resolve-recipients.server')
const { runInWorkerContext } = await import('~/shared/utils/worker-locale.server')

const CONGREGATION = {
  id: 42,
  emailFrom: 'Assembly <noreply@test.org>',
  baseUrl: 'https://test.org',
  displayName: 'Test Assembly',
  locale: 'en',
  timezone: 'UTC',
  suspendedAt: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(resolveCongregation).mockResolvedValue(CONGREGATION as never)
  // resetAllMocks() clears the pass-through implementation; restore it so
  // handlers that reach the worker context actually execute their fn arg.
  vi.mocked(runInWorkerContext).mockImplementation(<T>(_locale: string, _timezone: string, fn: () => T | Promise<T>) =>
    fn(),
  )
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
    // The WHERE must gate out left / anonymized members so publishers who
    // left the congregation don't receive instant notifications, and preserve
    // admin accounts (memberId: null) which are still valid targets.
    expect(unscopedDb.userAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          OR: [{ memberId: null }, { member: { leftAt: null, anonymizedAt: null } }],
        }),
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

  it('skips the send when the recipient disabled the exact type in their preferences', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({
      id: 7,
      email: 'user@test.org',
      firstname: 'Jean',
      member: null,
    } as never)
    vi.mocked(unscopedDb.notificationPreference.findFirst).mockResolvedValue({ id: 100 } as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'territory.sync.completed',
      recipientId: 7,
      recipientRole: null,
      payload: '{}',
    })

    expect(mailer.emails.send).not.toHaveBeenCalled()
  })

  it('still sends when the user has no preference row for this type (opt-out default)', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({
      id: 7,
      email: 'user@test.org',
      firstname: 'Jean',
      member: null,
    } as never)
    vi.mocked(unscopedDb.notificationPreference.findFirst).mockResolvedValue(null as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'territory.sync.completed',
      recipientId: 7,
      recipientRole: null,
      payload: '{}',
    })

    expect(mailer.emails.send).toHaveBeenCalledTimes(1)
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

describe('handleInstantEmail — transient mailer failures', () => {
  it('recipientId branch: propagates the throw so BullMQ retries (safe, single recipient)', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({
      id: 7,
      email: 'user@test.org',
      firstname: 'Jean',
      member: null,
    } as never)
    vi.mocked(mailer.emails.send).mockRejectedValue(new Error('Resend 429: rate limited'))

    // Single recipient per job → retry cannot double-send. Let BullMQ redrive.
    await expect(
      handleInstantEmail({
        type: 'notification-instant',
        congregationId: 42,
        notificationType: 'territory.sync.completed',
        recipientId: 7,
        recipientRole: null,
        payload: '{}',
      }),
    ).rejects.toThrow('Resend 429: rate limited')
  })

  it('recipientRole branch: one failure does not abort the fan-out or trigger a retry', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([
      { userId: 1, email: 'a@test.org', firstname: 'Alice' },
      { userId: 2, email: 'b@test.org', firstname: 'Bob' },
      { userId: 3, email: 'c@test.org', firstname: 'Carol' },
    ] as never)
    // Alice succeeds, Bob fails transiently, Carol succeeds.
    vi.mocked(mailer.emails.send)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('Resend 500: upstream'))
      .mockResolvedValueOnce({} as never)

    // If we let Bob's throw propagate, BullMQ retries the whole job and
    // re-mails Alice. The fan-out MUST swallow per-recipient failures.
    await expect(
      handleInstantEmail({
        type: 'notification-instant',
        congregationId: 42,
        notificationType: 'board.document.deleted',
        recipientId: null,
        recipientRole: 'board-validator',
        payload: JSON.stringify({ title: 'Removed doc' }),
      }),
    ).resolves.toBeUndefined()

    // All three attempts happened, and each targeted its own recipient —
    // guards against a regression that re-closes-over `recipient` and mails
    // the same person N times.
    expect(mailer.emails.send).toHaveBeenCalledTimes(3)
    expect(mailer.emails.send).toHaveBeenNthCalledWith(1, expect.objectContaining({ to: 'a@test.org' }))
    expect(mailer.emails.send).toHaveBeenNthCalledWith(2, expect.objectContaining({ to: 'b@test.org' }))
    expect(mailer.emails.send).toHaveBeenNthCalledWith(3, expect.objectContaining({ to: 'c@test.org' }))
  })
})

describe('handleInstantEmail — missing recipient', () => {
  it('warns and skips when the recipient user is deactivated or not found', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue(null as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'territory.sync.completed',
      recipientId: 9999,
      recipientRole: null,
      payload: '{}',
    })

    expect(mailer.emails.send).not.toHaveBeenCalled()
    // No preference check either — we exit before that lookup.
    expect(unscopedDb.notificationPreference.findFirst).not.toHaveBeenCalled()
  })
})

describe('handleDigestEmail — transient mailer failures partition per event', () => {
  it('marks the failing event failed, sends the others, and does not throw', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({
      id: 7,
      email: 'user@test.org',
      firstname: 'Jean',
      member: null,
    } as never)
    // Event 1 succeeds, event 2 fails transiently, event 3 succeeds.
    vi.mocked(mailer.emails.send)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('Resend 500: upstream'))
      .mockResolvedValueOnce({} as never)

    await expect(
      handleDigestEmail({
        type: 'notification-digest',
        congregationId: 42,
        recipientId: 7,
        events: [
          {
            type: 'programme.assignment.assigned',
            entityType: 'EventPart',
            entityId: 501,
            payload: JSON.stringify({
              eventId: 1,
              eventName: 'meeting',
              eventDate: '2026-07-20',
              assignmentName: 'A',
              role: 'speaker',
              link: '/board',
            }),
          },
          {
            type: 'programme.assignment.assigned',
            entityType: 'EventPart',
            entityId: 502,
            payload: JSON.stringify({
              eventId: 1,
              eventName: 'meeting',
              eventDate: '2026-07-20',
              assignmentName: 'B',
              role: 'speaker',
              link: '/board',
            }),
          },
          {
            type: 'programme.assignment.assigned',
            entityType: 'EventPart',
            entityId: 503,
            payload: JSON.stringify({
              eventId: 1,
              eventName: 'meeting',
              eventDate: '2026-07-20',
              assignmentName: 'C',
              role: 'speaker',
              link: '/board',
            }),
          },
        ],
        notificationEventIds: [11, 22, 33],
      }),
    ).resolves.toBeUndefined()

    // All three send attempts happened — event 2's failure did not abort.
    expect(mailer.emails.send).toHaveBeenCalledTimes(3)
    // Only event 22 is flipped to failed; events 11 and 33 stay `sent` from
    // flush-settled. If we retried, events 11 and 33 would be re-mailed.
    expect(unscopedDb.notificationEvent.updateMany).toHaveBeenCalledTimes(1)
    expect(unscopedDb.notificationEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [22] } },
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
  })
})

describe('suspended congregations are gated out of the pipeline', () => {
  const SUSPENDED = { ...CONGREGATION, suspendedAt: new Date('2026-07-01T00:00:00Z') }

  it('handleInstantEmail: recipientId branch — does not query the DB or send', async () => {
    vi.mocked(resolveCongregation).mockResolvedValue(SUSPENDED as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'territory.sync.completed',
      recipientId: 7,
      recipientRole: null,
      payload: '{}',
    })

    expect(unscopedDb.userAccount.findFirst).not.toHaveBeenCalled()
    expect(mailer.emails.send).not.toHaveBeenCalled()
    // The guard runs BEFORE runInWorkerContext — moving it inside would waste
    // an AsyncLocalStorage frame and this assertion would catch the drift.
    expect(runInWorkerContext).not.toHaveBeenCalled()
  })

  it('handleInstantEmail: recipientRole branch — does not resolve recipients or send', async () => {
    vi.mocked(resolveCongregation).mockResolvedValue(SUSPENDED as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'board.document.deleted',
      recipientId: null,
      recipientRole: 'board-validator',
      payload: JSON.stringify({ title: 'Removed doc' }),
    })

    expect(resolveRecipients).not.toHaveBeenCalled()
    expect(mailer.emails.send).not.toHaveBeenCalled()
  })

  it('handleDigestEmail: does not send and does not mark events failed', async () => {
    vi.mocked(resolveCongregation).mockResolvedValue(SUSPENDED as never)

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
      ],
      notificationEventIds: [11],
    })

    expect(mailer.emails.send).not.toHaveBeenCalled()
    // Suspension is not a render failure — leave rows in whatever status
    // flush-settled left them; do not flip anything to `failed`.
    expect(unscopedDb.notificationEvent.updateMany).not.toHaveBeenCalled()
    // Same guard-before-context invariant as the instant path.
    expect(runInWorkerContext).not.toHaveBeenCalled()
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

    // Both events rendered → no updateMany call. flush-settled already
    // marked them `sent` before the job ran; only failures need a flip.
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

  it('respects the recipient preference on the entity-user (recipientId!=0) branch', async () => {
    // Simulate the entity-user path: recipientId points at a specific user;
    // that user disabled the type in their preferences.
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({
      id: 7,
      email: 'user@test.org',
      firstname: 'Jean',
      member: null,
    } as never)
    vi.mocked(unscopedDb.notificationPreference.findFirst).mockResolvedValue({ id: 100 } as never)

    await handleDigestEmail({
      type: 'notification-digest',
      congregationId: 42,
      recipientId: 7,
      events: [
        {
          type: 'programme.assignment.assigned',
          entityType: 'EventPart',
          entityId: 500,
          payload: JSON.stringify({
            eventId: 1,
            eventName: 'meeting',
            eventDate: '2026-07-20',
            assignmentName: 'Part',
            role: 'speaker',
            link: '/board',
          }),
        },
      ],
      notificationEventIds: [77],
    })

    // Preference-blocked events do NOT count as permanent failures — the row
    // stays `sent` (its lifecycle already terminated at flush time). The user
    // simply didn't get an email.
    expect(mailer.emails.send).not.toHaveBeenCalled()
    expect(unscopedDb.notificationEvent.updateMany).not.toHaveBeenCalled()
  })

  it('gates recipient lookup on notificationRecipientFilter (left/anonymized members excluded, admins preserved)', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({
      id: 7,
      email: 'user@test.org',
      firstname: 'Jean',
      member: null,
    } as never)

    await handleDigestEmail({
      type: 'notification-digest',
      congregationId: 42,
      recipientId: 7,
      events: [
        {
          type: 'programme.assignment.assigned',
          entityType: 'EventPart',
          entityId: 500,
          payload: JSON.stringify({
            eventId: 1,
            eventName: 'meeting',
            eventDate: '2026-07-20',
            assignmentName: 'Part',
            role: 'speaker',
            link: '/board',
          }),
        },
      ],
      notificationEventIds: [77],
    })

    expect(unscopedDb.userAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          OR: [{ memberId: null }, { member: { leftAt: null, anonymizedAt: null } }],
        }),
      }),
    )
  })
})

describe('handleDigestEmail — recipientId=0 role-fanout branch', () => {
  it('flips the event to failed when one role recipient mailer-fails, other recipients still receive it', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([
      { userId: 1, email: 'a@test.org', firstname: 'Alice' },
      { userId: 2, email: 'b@test.org', firstname: 'Bob' },
      { userId: 3, email: 'c@test.org', firstname: 'Carol' },
    ] as never)
    // Alice succeeds, Bob fails, Carol succeeds — inside sendEventEmail's
    // role loop. The per-recipient catch keeps the fan-out going and the
    // event ends up marked failed.
    vi.mocked(mailer.emails.send)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('Resend 500: upstream'))
      .mockResolvedValueOnce({} as never)

    await expect(
      handleDigestEmail({
        type: 'notification-digest',
        congregationId: 42,
        recipientId: 0,
        events: [
          {
            type: 'board.document.created',
            entityType: 'BoardDocument',
            entityId: 900,
            payload: JSON.stringify({ title: 'Doc X', documentId: 900 }),
          },
        ],
        notificationEventIds: [55],
      }),
    ).resolves.toBeUndefined()

    expect(mailer.emails.send).toHaveBeenCalledTimes(3)
    // One transient failure among the three recipients is enough to flip
    // the event; the other two already received their email.
    expect(unscopedDb.notificationEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [55] } },
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
  })

  it('marks the event failed when its type has no registered recipientRole config', async () => {
    await handleDigestEmail({
      type: 'notification-digest',
      congregationId: 42,
      recipientId: 0,
      events: [
        {
          type: 'unregistered.type.xyz',
          entityType: 'Nothing',
          entityId: 999,
          payload: '{}',
        },
      ],
      notificationEventIds: [66],
    })

    // Drift between producer and NOTIFICATION_TYPES registry — treat as
    // permanent so it surfaces in ops rather than silently disappearing.
    expect(resolveRecipients).not.toHaveBeenCalled()
    expect(mailer.emails.send).not.toHaveBeenCalled()
    expect(unscopedDb.notificationEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [66] } },
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
  })
})

describe('handleDigestEmail — recipient lookup misses', () => {
  it('does not flip the event to failed when the recipient is no longer active', async () => {
    // Recipient was deactivated between flush-settled and this job firing.
    // Not a delivery failure — nothing to deliver — but the event row must
    // NOT be flipped to `failed` (that would suggest something went wrong).
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue(null as never)

    await handleDigestEmail({
      type: 'notification-digest',
      congregationId: 42,
      recipientId: 7,
      events: [
        {
          type: 'programme.assignment.assigned',
          entityType: 'EventPart',
          entityId: 700,
          payload: JSON.stringify({
            eventId: 1,
            eventName: 'meeting',
            eventDate: '2026-07-20',
            assignmentName: 'A',
            role: 'speaker',
            link: '/board',
          }),
        },
      ],
      notificationEventIds: [88],
    })

    expect(mailer.emails.send).not.toHaveBeenCalled()
    expect(unscopedDb.notificationEvent.updateMany).not.toHaveBeenCalled()
  })
})

describe('handleDigestEmail — notificationEventIds bookkeeping', () => {
  it('drops the failure quietly when events.length exceeds notificationEventIds.length', async () => {
    // Defensive: if a producer ever ships mismatched arrays, index-based
    // lookup returns undefined for the overflow event and the typeof-number
    // guard drops it. Assert this actually happens — a regression that
    // e.g. crashes on undefined would ship without this test.
    await handleDigestEmail({
      type: 'notification-digest',
      congregationId: 42,
      recipientId: 0,
      events: [
        {
          // Unregistered type → permanent-failure result → tries to look up
          // its id in notificationEventIds.
          type: 'unregistered.type.xyz',
          entityType: 'Nothing',
          entityId: 111,
          payload: '{}',
        },
      ],
      // Empty array — index 0 is undefined.
      notificationEventIds: [],
    })

    // No failure ids to update.
    expect(unscopedDb.notificationEvent.updateMany).not.toHaveBeenCalled()
  })
})
