import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Resend SDK resolves — it does NOT throw — when the API rejects a send
// (unverified domain, invalid `from`, rate limit). It signals failure through
// the `error` field of the resolved value. Every call site in this codebase
// treated a resolved promise as "delivered", so those rejections were silently
// swallowed. These tests pin `sendEmail` as the single place that converts an
// `error` payload into a thrown error.
const sendMock = vi.hoisted(() => vi.fn())

vi.mock('resend', () => ({
  // Must be constructible — `getMailer()` calls `new Resend(...)`.
  Resend: class {
    emails = { send: sendMock }
  },
}))

const { sendEmail } = await import('./mailer.server')

const PAYLOAD = { to: 'recipient@test.org', from: 'Congré <noreply@test.org>', subject: 'Sujet', react: null }

beforeEach(() => {
  // clear, not reset: the Resend instance is cached at module scope, so
  // wiping implementations would leave later tests with a dead `send`.
  vi.clearAllMocks()
})

describe('sendEmail', () => {
  it('resolves with the Resend message id when the API accepts the send', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_sentinel_42' }, error: null })

    await expect(sendEmail(PAYLOAD as never)).resolves.toEqual({ id: 'msg_sentinel_42' })
  })

  it('throws when the API rejects the send, surfacing the Resend message', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'The us.example.org domain is not verified' },
    })

    await expect(sendEmail(PAYLOAD as never)).rejects.toThrow('The us.example.org domain is not verified')
  })

  it('throws when the API rejects the send without a usable message', async () => {
    sendMock.mockResolvedValue({ data: null, error: { name: 'rate_limit_exceeded' } })

    await expect(sendEmail(PAYLOAD as never)).rejects.toThrow('rate_limit_exceeded')
  })

  it('propagates a transport-level rejection unchanged', async () => {
    sendMock.mockRejectedValue(new Error('ECONNRESET'))

    await expect(sendEmail(PAYLOAD as never)).rejects.toThrow('ECONNRESET')
  })
})
