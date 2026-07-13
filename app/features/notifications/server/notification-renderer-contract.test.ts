// Contract test: every definition registered in NOTIFICATION_REGISTRY must
// ship an `example` payload that (a) satisfies its own Zod schema and (b)
// produces a non-null React element when passed through renderNotificationEmail.
//
// Under the plugin registry, the example lives on the definition itself — so
// this test just iterates the registry and asserts the two invariants. Adding
// a new definition to a consumer feature is automatically covered.

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
