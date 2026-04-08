import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  unscopedDb: {
    user: { findFirst: vi.fn() },
  },
}))

vi.mock('~/shared/libs/congregation.server', () => ({
  resolveCongregation: vi.fn(),
}))

vi.mock('~/shared/libs/mailer.server', () => ({
  mailer: {
    emails: { send: vi.fn() },
  },
}))

vi.mock('~/shared/libs/logger.server', () => ({
  default: {
    error: vi.fn(),
  },
}))

const { sendResetUserPasswordEmail } = await import('./send-reset-user-password-email.server')
const { unscopedDb: db } = await import('~/shared/libs/db.server')
const { resolveCongregation } = await import('~/shared/libs/congregation.server')
const { mailer } = await import('~/shared/libs/mailer.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('sendResetUserPasswordEmail', () => {
  it('retourne false quand l\'utilisateur n\'existe pas', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(null as never)

    const result = await sendResetUserPasswordEmail(999, 'email-template' as never)
    expect(result).toBe(false)
  })

  it('envoie l\'email quand l\'utilisateur existe', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue({ id: 1, email: 'test@example.com', congregationId: 5 } as never)
    vi.mocked(resolveCongregation).mockResolvedValue({ emailFrom: 'Congré <noreply@test.org>' } as never)
    vi.mocked(mailer.emails.send).mockResolvedValue({} as never)

    // Ne doit pas retourner false
    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await sendResetUserPasswordEmail(1, 'email-template' as never)
    // La fonction ne retourne rien (undefined) en cas de succès
    expect(result).not.toBe(false)
  })

  it('ne lance pas d\'erreur quand l\'envoi d\'email échoue', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue({ id: 1, email: 'test@example.com', congregationId: 5 } as never)
    vi.mocked(resolveCongregation).mockResolvedValue({ emailFrom: 'Congré <noreply@test.org>' } as never)
    vi.mocked(mailer.emails.send).mockRejectedValue(new Error('SMTP error'))

    await expect(sendResetUserPasswordEmail(1, 'email-template' as never)).resolves.not.toThrow()
  })
})
