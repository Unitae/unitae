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

const { isEmailConfigured, sendEmail } = await import('./mailer.server')

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

describe('sendEmail to the demo’s invented addresses', () => {
  // The demo's people live at demo.unitae.app and its visiting speakers at example.org: invented addresses, which
  // would bounce and still cost sending quota. Nothing leaves for them, whoever triggers the e-mail.
  it('sends nothing when every recipient is invented', async () => {
    await expect(
      sendEmail({ ...PAYLOAD, to: ['marc.dupont+x7k2p@demo.unitae.app', 'paul.orateur@example.org'] } as never),
    ).resolves.toBeNull()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sends to the real recipients only', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null })

    await sendEmail({ ...PAYLOAD, to: ['marc.dupont@demo.unitae.app', 'real@test.org'], cc: 'x@example.com' } as never)

    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ to: ['real@test.org'], cc: [] }))
  })

  it('reads an address written with a name', async () => {
    await expect(sendEmail({ ...PAYLOAD, to: 'Marc Dupont <marc@demo.unitae.app>' } as never)).resolves.toBeNull()
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('isEmailConfigured', () => {
  it('says whether this installation can send e-mail at all: only with a Resend key', () => {
    vi.stubEnv('RESEND_API_KEY', 're_sentinel')
    expect(isEmailConfigured()).toBe(true)

    vi.stubEnv('RESEND_API_KEY', '')
    expect(isEmailConfigured()).toBe(false)

    vi.unstubAllEnvs()
  })
})
