import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreatePasswordResetToken = vi.fn()
const mockSendResetUserPasswordEmail = vi.fn()
const mockErrorIfWouldGoOverLimit = vi.fn()

vi.mock('~/features/authentication/server/invalidate-user-password.server', () => ({
  createPasswordResetToken: mockCreatePasswordResetToken,
}))

vi.mock('~/features/authentication/server/send-reset-user-password-email.server', () => ({
  sendResetUserPasswordEmail: mockSendResetUserPasswordEmail,
}))

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { UserCreated: 'UserCreated' },
  audit: vi.fn(),
}))

vi.mock('~/shared/domain/limits.server', () => ({
  LimitService: class {
    errorIfWouldGoOverLimit = mockErrorIfWouldGoOverLimit
  },
}))

const mockDb = {
  user: { findUnique: vi.fn(), create: vi.fn() },
}

const { createUser } = await import('./create-user.server')
const { ConflictError } = await import('~/shared/errors/app-error.server')
const { audit } = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
})

const baseCongregation = {
  maxPublishers: null,
  maxTerritories: null,
  maxUsers: null,
  maxStorageBytes: null,
  maxBoardDocuments: null,
} as any

const baseParams = {
  firstname: 'Sophie',
  lastname: 'Lemoine',
  email: 'sophie@example.com',
  congregationId: 1,
}

const mockRenderEmail = vi.fn()

describe('createUser', () => {
  it('creates user and returns result with emailSent status', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.user.create.mockResolvedValue({ id: 42 } as never)
    mockCreatePasswordResetToken.mockResolvedValue('token-abc')
    mockSendResetUserPasswordEmail.mockResolvedValue(true)

    const result = await createUser(mockDb as any, baseCongregation, 99, baseParams, mockRenderEmail)

    expect(result).toEqual({ userId: 42, emailSent: true })
    expect(mockDb.user.create).toHaveBeenCalled()
    const createCall = mockDb.user.create.mock.calls[0][0]
    expect(createCall.data.email).toBe('sophie@example.com')
    expect(createCall.data.firstname).toBe('Sophie')
  })

  it('throws ConflictError when user already exists', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 1, email: 'sophie@example.com' })

    await expect(
      createUser(mockDb as any, baseCongregation, 99, baseParams, mockRenderEmail),
    ).rejects.toThrow(ConflictError)

    expect(mockDb.user.create).not.toHaveBeenCalled()
  })

  it('calls createPasswordResetToken and sendResetUserPasswordEmail', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.user.create.mockResolvedValue({ id: 10 } as never)
    mockCreatePasswordResetToken.mockResolvedValue('token-xyz')
    mockSendResetUserPasswordEmail.mockResolvedValue(false)
    mockRenderEmail.mockReturnValue('<html>email</html>')

    const result = await createUser(mockDb as any, baseCongregation, 99, baseParams, mockRenderEmail)

    expect(mockCreatePasswordResetToken).toHaveBeenCalledWith(10)
    expect(mockRenderEmail).toHaveBeenCalledWith(10, 'token-xyz')
    expect(mockSendResetUserPasswordEmail).toHaveBeenCalledWith(10, '<html>email</html>')
    expect(result.emailSent).toBe(false)
  })
})
