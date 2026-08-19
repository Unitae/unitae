import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findFirst: vi.fn() },
  },
}))

vi.mock('~/shared/domain/congregation.server', () => ({
  resolveCongregation: vi.fn(),
}))

vi.mock('~/shared/infra/mailer.server', () => ({
  sendEmail: vi.fn(),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: {
    error: vi.fn(),
  },
}))

const { sendResetAccountPasswordEmail } = await import('./send-reset-account-password-email.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { resolveCongregation } = await import('~/shared/domain/congregation.server')
const { sendEmail } = await import('~/shared/infra/mailer.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('sendResetAccountPasswordEmail', () => {
  it("retourne false quand l'utilisateur n'existe pas", async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(null as never)

    const result = await sendResetAccountPasswordEmail(999, 'email-template' as never)
    expect(result).toBe(false)
  })

  it("envoie l'email quand l'utilisateur existe", async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      congregationId: 5,
    } as never)
    vi.mocked(resolveCongregation).mockResolvedValue({ emailFrom: 'Congré <noreply@test.org>' } as never)
    vi.mocked(sendEmail).mockResolvedValue({} as never)

    // Ne doit pas retourner false
    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await sendResetAccountPasswordEmail(1, 'email-template' as never)
    // La fonction ne retourne rien (undefined) en cas de succès
    expect(result).not.toBe(false)
  })

  it("ne lance pas d'erreur quand l'envoi d'email échoue", async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      congregationId: 5,
    } as never)
    vi.mocked(resolveCongregation).mockResolvedValue({ emailFrom: 'Congré <noreply@test.org>' } as never)
    vi.mocked(sendEmail).mockRejectedValue(new Error('SMTP error'))

    await expect(sendResetAccountPasswordEmail(1, 'email-template' as never)).resolves.not.toThrow()
  })
})
