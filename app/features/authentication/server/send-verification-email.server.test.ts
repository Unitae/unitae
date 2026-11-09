import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFindFirst = vi.fn()
const mockResolveCongregation = vi.fn()
const mockSend = vi.fn()
const mockLoggerError = vi.fn()

// The generated runtime keeps the getLocale override in module state; this stand-in does the same,
// so a test can read the locale the email was written in.
const runtime = vi.hoisted(() => ({ getLocale: (): string => 'fr' }))

vi.mock('~/i18n/paraglide/runtime', () => ({
  isLocale: (value: unknown) => value === 'fr' || value === 'en',
  overwriteGetLocale: (fn: () => string) => {
    runtime.getLocale = fn
  },
}))

vi.mock('~/i18n/paraglide/messages', () => ({
  email_verify_subject: () => `subject (${runtime.getLocale()})`,
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { userAccount: { findFirst: mockFindFirst } },
}))
vi.mock('~/shared/domain/congregation.server', () => ({
  resolveCongregation: mockResolveCongregation,
}))
vi.mock('~/shared/infra/mailer.server', () => ({
  sendEmail: mockSend,
}))
vi.mock('~/shared/infra/logger.server', () => ({
  default: { error: mockLoggerError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { runWithLocale } = await import('~/shared/utils/locale-scope.server')
const { sendVerificationEmail } = await import('./send-verification-email.server')

beforeEach(() => {
  vi.resetAllMocks()
})

const emailNode = 'the-react-node' as unknown as import('react').ReactNode

describe('sendVerificationEmail', () => {
  it('returns false when the user does not exist', async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await sendVerificationEmail(1, emailNode)
    expect(result).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sends the email to the user with the congregation-configured from-address', async () => {
    mockFindFirst.mockResolvedValue({ id: 1, email: 'user@example.com', congregationId: 42 })
    mockResolveCongregation.mockResolvedValue({ emailFrom: 'noreply@congregation.example' })
    mockSend.mockResolvedValue(undefined)

    const result = await sendVerificationEmail(1, emailNode)

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'noreply@congregation.example',
        react: emailNode,
      }),
    )
    expect(result).toBe(true)
  })

  it('resolves the congregation for the user before sending', async () => {
    mockFindFirst.mockResolvedValue({ id: 1, email: 'user@example.com', congregationId: 42 })
    mockResolveCongregation.mockResolvedValue({ emailFrom: 'x@x' })
    mockSend.mockResolvedValue(undefined)

    await sendVerificationEmail(1, emailNode)

    expect(mockResolveCongregation).toHaveBeenCalledWith(42)
  })

  it('returns false and logs when the mailer rejects', async () => {
    mockFindFirst.mockResolvedValue({ id: 1, email: 'user@example.com', congregationId: 42 })
    mockResolveCongregation.mockResolvedValue({ emailFrom: 'x@x' })
    mockSend.mockRejectedValue(new Error('smtp down'))

    const result = await sendVerificationEmail(1, emailNode)

    expect(result).toBe(false)
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to send verification email',
      expect.objectContaining({ userId: 1 }),
    )
  })
})

// An email addressed to one account goes out in that account's language, whoever set it off: an
// admin who chose English inviting a member who follows a French congregation writes in French.
describe('sendVerificationEmail — language', () => {
  async function sendFromSessionIn(sessionLocale: 'fr' | 'en', recipientLocale: string | null) {
    mockFindFirst.mockResolvedValue({ id: 1, email: 'test@example.com', congregationId: 5, locale: recipientLocale })
    mockResolveCongregation.mockResolvedValue({ emailFrom: 'x@test.org', locale: 'fr' })
    let bodyLocale: string | undefined
    mockSend.mockImplementation(() => {
      // Resend renders the React body inside this call.
      bodyLocale = runtime.getLocale()
      return Promise.resolve(null)
    })

    await runWithLocale(sessionLocale, () => sendVerificationEmail(1, 'email-template' as never))

    return { subject: mockSend.mock.calls[0][0].subject, bodyLocale }
  }

  it("writes in the congregation's language when the recipient follows it", async () => {
    await expect(sendFromSessionIn('en', null)).resolves.toEqual({ subject: 'subject (fr)', bodyLocale: 'fr' })
  })

  it("writes in the recipient's own language when it chose one", async () => {
    await expect(sendFromSessionIn('fr', 'en')).resolves.toEqual({ subject: 'subject (en)', bodyLocale: 'en' })
  })
})
