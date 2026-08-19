import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFindFirst = vi.fn()
const mockResolveCongregation = vi.fn()
const mockSend = vi.fn()
const mockLoggerError = vi.fn()

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
