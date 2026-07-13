// Contract test: every definition registered in NOTIFICATION_REGISTRY must
// ship an `example` payload that (a) satisfies its own Zod schema and (b)
// produces a non-null React element when passed through renderNotificationEmail.
// The example lives on the definition itself — adding a new definition to a
// consumer feature is automatically covered.
//
// Also covers the two failure modes: unregistered type and invalid payload
// both must return a null react so the worker records the event as failed.

import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/mailer.server', () => ({
  mailer: { emails: { send: vi.fn() } },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const { renderNotificationEmail } = await import('./render-notification-email.server')
const { NOTIFICATION_REGISTRY } = await import('./registry.server')

const RECIPIENT = { email: 'r@test.org', firstname: 'Test' }
const CONGREGATION = {
  id: 1,
  emailFrom: 'Assembly <noreply@test.org>',
  baseUrl: 'https://test.org',
  displayName: 'Test Assembly',
  locale: 'en',
}

describe('renderNotificationEmail contract', () => {
  for (const [type, def] of NOTIFICATION_REGISTRY) {
    describe(type, () => {
      it('example payload satisfies its own schema', () => {
        expect(def.payload.safeParse(def.example).success).toBe(true)
      })

      it('renders a non-null React element with a non-empty subject', () => {
        const result = renderNotificationEmail(type, def.example, RECIPIENT, CONGREGATION as never)
        expect(result.react).not.toBeNull()
        expect(result.subject).toBeTruthy()
      })
    })
  }
})

describe('renderNotificationEmail failure modes', () => {
  it('returns {subject: "", react: null} for an unregistered notification type', () => {
    const result = renderNotificationEmail('does.not.exist', {}, RECIPIENT, CONGREGATION as never)
    expect(result.subject).toBe('')
    expect(result.react).toBeNull()
  })

  it('returns {subject: "", react: null} when the payload fails the definition schema', () => {
    // board.document.created's schema requires {title: string, documentId: number}
    const result = renderNotificationEmail(
      'board.document.created',
      { bogus: 'data' },
      RECIPIENT,
      CONGREGATION as never,
    )
    expect(result.subject).toBe('')
    expect(result.react).toBeNull()
  })
})
