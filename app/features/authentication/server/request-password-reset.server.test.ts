import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findFirst: vi.fn() },
  },
}))

vi.mock('./rate-limit.server', () => ({
  guardPasswordResetRequest: vi.fn(),
}))

vi.mock('./invalidate-account-password.server', () => ({
  createPasswordResetToken: vi.fn(),
}))

vi.mock('./send-reset-account-password-email.server', () => ({
  sendResetAccountPasswordEmail: vi.fn(),
}))

vi.mock('~/shared/domain/congregation.server', () => ({
  resolveCongregation: vi.fn(),
}))

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  AuditAction: { PasswordResetRequested: 'password.reset.requested' },
}))

vi.mock('~/features/authentication/emails/reset-password', () => ({
  default: () => null,
}))

const { requestPasswordReset } = await import('./request-password-reset.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { guardPasswordResetRequest } = await import('./rate-limit.server')
const { createPasswordResetToken } = await import('./invalidate-account-password.server')
const { sendResetAccountPasswordEmail } = await import('./send-reset-account-password-email.server')
const { resolveCongregation } = await import('~/shared/domain/congregation.server')
const { audit } = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
})

const fakeUser = {
  id: 42,
  email: 'test@example.com',
  congregationId: 7,
  firstname: 'Alice',
  member: { firstname: null },
}

const fakeCongregation = { baseUrl: 'https://cong.test', displayName: 'Ma Congrégation' }

describe('requestPasswordReset', () => {
  it('enregistre la tentative de rate-limit même pour un email inconnu', async () => {
    vi.mocked(guardPasswordResetRequest).mockResolvedValue({ limited: false })
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(null as never)

    const result = await requestPasswordReset('inconnu@example.com', '203.0.113.7')

    // La tentative DOIT être comptée même sans compte, sinon la présence/absence
    // de rate-limiting devient un oracle d'énumération.
    expect(guardPasswordResetRequest).toHaveBeenCalledWith('inconnu@example.com', '203.0.113.7')
    // Aucun travail spécifique à un compte réel ne doit avoir lieu.
    expect(createPasswordResetToken).not.toHaveBeenCalled()
    expect(sendResetAccountPasswordEmail).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'no-user' })
  })

  it('ne cherche pas le compte quand le rate-limit est atteint', async () => {
    vi.mocked(guardPasswordResetRequest).mockResolvedValue({ limited: true })

    const result = await requestPasswordReset('test@example.com', '203.0.113.7')

    expect(db.userAccount.findFirst).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'rate-limited' })
  })

  it('normalise l’email en minuscules pour le rate-limit et la recherche', async () => {
    vi.mocked(guardPasswordResetRequest).mockResolvedValue({ limited: false })
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(null as never)

    await requestPasswordReset('INCONNU@EXAMPLE.COM', '203.0.113.7')

    expect(guardPasswordResetRequest).toHaveBeenCalledWith('inconnu@example.com', '203.0.113.7')
    expect(db.userAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ email: 'inconnu@example.com' }) }),
    )
  })

  it('crée un token, envoie l’email et audite pour un utilisateur réel', async () => {
    vi.mocked(guardPasswordResetRequest).mockResolvedValue({ limited: false })
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(createPasswordResetToken).mockResolvedValue('reset-token')
    vi.mocked(resolveCongregation).mockResolvedValue(fakeCongregation as never)
    vi.mocked(sendResetAccountPasswordEmail).mockResolvedValue(true)

    const result = await requestPasswordReset('test@example.com', '203.0.113.7')

    // A self-service request keeps any link the user is already waiting for.
    expect(createPasswordResetToken).toHaveBeenCalledWith(42, undefined, { keepPending: true })
    expect(sendResetAccountPasswordEmail).toHaveBeenCalledWith(42, expect.anything())
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'password.reset.requested', congregationId: 7, actorId: 42, entityId: 42 }),
    )
    expect(result).toEqual({ status: 'processed', emailDelivered: true })
  })

  it('remonte l’échec d’envoi de l’email sans changer le statut', async () => {
    vi.mocked(guardPasswordResetRequest).mockResolvedValue({ limited: false })
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(createPasswordResetToken).mockResolvedValue('reset-token')
    vi.mocked(resolveCongregation).mockResolvedValue(fakeCongregation as never)
    vi.mocked(sendResetAccountPasswordEmail).mockResolvedValue(false)

    const result = await requestPasswordReset('test@example.com', '203.0.113.7')

    expect(result).toEqual({ status: 'processed', emailDelivered: false })
  })
})
