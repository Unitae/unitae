// Contract test: every entry in NOTIFICATION_TYPES must have a renderer that
// produces a non-null React element for a valid payload. Adding a type to the
// registry without wiring its render case fails silently at runtime (missing
// template just logs a warning and drops the email). This test catches that
// at CI time.

import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/mailer.server', () => ({
  mailer: { emails: { send: vi.fn() } },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const { renderNotificationEmail } = await import('./render-notification-email.server')
const { NOTIFICATION_TYPES } = await import('./notification-types.server')

const RECIPIENT = { email: 'r@test.org', firstname: 'Test' }
const CONGREGATION = {
  id: 1,
  emailFrom: 'Assembly <noreply@test.org>',
  baseUrl: 'https://test.org',
  displayName: 'Test Assembly',
  locale: 'en',
}

// Fixture payload per notification type. Every key in NOTIFICATION_TYPES must
// appear here — the test below enforces that.
const VALID_PAYLOADS: Record<string, unknown> = {
  'board.document.created': { title: 'Doc', documentId: 42 },
  'board.document.updated': { title: 'Doc', documentId: 42 },
  'board.document.deleted': { title: 'Doc' },
  'board.document.expiring': { documents: [{ id: 1, title: 'Doc' }] },
  'territory.sync.completed': {},
}

describe('renderNotificationEmail contract', () => {
  it('has a fixture for every registered notification type', () => {
    const registered = Object.keys(NOTIFICATION_TYPES).sort()
    const fixtured = Object.keys(VALID_PAYLOADS).sort()
    expect(fixtured).toEqual(registered)
  })

  for (const type of Object.keys(NOTIFICATION_TYPES)) {
    it(`renders a non-null template for ${type}`, () => {
      const payload = VALID_PAYLOADS[type]
      const result = renderNotificationEmail(type, payload, RECIPIENT, CONGREGATION as never)

      expect(result.react).not.toBeNull()
      expect(result.subject).toBeTruthy()
    })
  }
})
