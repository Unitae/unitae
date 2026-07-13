import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  mailer: {
    emails: { send: vi.fn() },
  },
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
const BoardDocumentDeleted = (await import('~/features/notifications/emails/board-document-deleted')).default
const BoardDocumentUpdated = (await import('~/features/notifications/emails/board-document-updated')).default
const DocumentsExpiring = (await import('~/features/notifications/emails/documents-expiring')).default
const { BuildingSyncDoneEmail: BuildingSyncDone } = await import('~/features/territories')

const CONGREGATION = {
  id: 42,
  emailFrom: 'Assembly <noreply@test.org>',
  baseUrl: 'https://test.org',
  displayName: 'Test Assembly',
  locale: 'en',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(resolveCongregation).mockResolvedValue(CONGREGATION as never)
})

describe('handleInstantEmail — territory.sync.completed', () => {
  it('sends BuildingSyncDone to the requesting user', async () => {
    vi.mocked(unscopedDb.userAccount.findFirst).mockResolvedValue({
      id: 7,
      email: 'user@test.org',
      firstname: 'Jean',
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
    expect(sent.react.type).toBe(BuildingSyncDone)
    expect((sent.react.props as { firstname?: string }).firstname).toBe('Jean')
  })

  it('prefers the linked Member firstname over the UserAccount firstname', async () => {
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

    const sent = vi.mocked(mailer.emails.send).mock.calls[0][0] as { react: ReactElement }
    expect((sent.react.props as { firstname?: string }).firstname).toBe('MemberName')
  })
})

describe('handleInstantEmail — board.document.updated', () => {
  it('sends BoardDocumentUpdated with the doc title and id', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([
      { userId: 1, email: 'validator@test.org', firstname: 'Alice' },
    ] as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'board.document.updated',
      recipientId: null,
      recipientRole: 'board-validator',
      payload: JSON.stringify({ title: 'Edited meeting agenda', documentId: 77 }),
    })

    expect(mailer.emails.send).toHaveBeenCalledTimes(1)
    const sent = vi.mocked(mailer.emails.send).mock.calls[0][0] as {
      to: string
      subject: string
      react: ReactElement
    }
    expect(sent.to).toBe('validator@test.org')
    expect(sent.subject).toBeTruthy()
    expect(sent.react.type).toBe(BoardDocumentUpdated)
    expect((sent.react.props as { filename: string; documentId: number }).filename).toBe('Edited meeting agenda')
    expect((sent.react.props as { filename: string; documentId: number }).documentId).toBe(77)
  })

  it('sends nothing when the updated payload is malformed', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([
      { userId: 1, email: 'validator@test.org', firstname: 'Alice' },
    ] as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'board.document.updated',
      recipientId: null,
      recipientRole: 'board-validator',
      payload: JSON.stringify({ title: 'no id' }),
    })

    expect(mailer.emails.send).not.toHaveBeenCalled()
  })
})

describe('handleInstantEmail — board.document.deleted', () => {
  it('sends BoardDocumentDeleted with the removed document title', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([
      { userId: 1, email: 'validator@test.org', firstname: 'Alice' },
    ] as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'board.document.deleted',
      recipientId: null,
      recipientRole: 'board-validator',
      payload: JSON.stringify({ title: 'Removed meeting agenda' }),
    })

    expect(mailer.emails.send).toHaveBeenCalledTimes(1)
    const sent = vi.mocked(mailer.emails.send).mock.calls[0][0] as {
      to: string
      subject: string
      react: ReactElement
    }
    expect(sent.to).toBe('validator@test.org')
    expect(sent.subject).toBeTruthy()
    expect(sent.react.type).toBe(BoardDocumentDeleted)
    expect((sent.react.props as { filename: string }).filename).toBe('Removed meeting agenda')
  })

  it('sends nothing when the deleted payload is malformed', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([
      { userId: 1, email: 'validator@test.org', firstname: 'Alice' },
    ] as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'board.document.deleted',
      recipientId: null,
      recipientRole: 'board-validator',
      payload: JSON.stringify({}),
    })

    expect(mailer.emails.send).not.toHaveBeenCalled()
  })
})

describe('handleInstantEmail — board.document.expiring', () => {
  it('sends DocumentsExpiring to each resolved role recipient with the payload documents', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([
      { userId: 1, email: 'validator1@test.org', firstname: 'Alice' },
      { userId: 2, email: 'validator2@test.org', firstname: null },
    ] as never)

    await handleInstantEmail({
      type: 'notification-instant',
      congregationId: 42,
      notificationType: 'board.document.expiring',
      recipientId: null,
      recipientRole: 'board-validator',
      payload: JSON.stringify({
        documents: [
          { id: 101, title: 'Meeting agenda' },
          { id: 102, title: 'Field notes' },
        ],
      }),
    })

    expect(mailer.emails.send).toHaveBeenCalledTimes(2)
    const firstCall = vi.mocked(mailer.emails.send).mock.calls[0][0] as {
      to: string
      subject: string
      react: ReactElement
    }
    expect(firstCall.to).toBe('validator1@test.org')
    expect(firstCall.subject).toBeTruthy()
    expect(firstCall.react.type).toBe(DocumentsExpiring)
    expect((firstCall.react.props as { documents: unknown[] }).documents).toEqual([
      { id: 101, title: 'Meeting agenda' },
      { id: 102, title: 'Field notes' },
    ])
  })

  it('sends nothing when the expiring payload is malformed', async () => {
    vi.mocked(resolveRecipients).mockResolvedValue([
      { userId: 1, email: 'validator@test.org', firstname: 'Alice' },
    ] as never)

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
