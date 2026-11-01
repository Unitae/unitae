import { beforeEach, describe, expect, it, vi } from 'vitest'

// The generated runtime keeps the getLocale override in module state; this stand-in does the same,
// so a test can read the locale the email was written in.
const runtime = vi.hoisted(() => ({ getLocale: (): string => 'fr' }))

vi.mock('~/i18n/paraglide/runtime', () => ({
  baseLocale: 'fr',
  isLocale: (value: unknown) => value === 'fr' || value === 'en',
  overwriteGetLocale: (fn: () => string) => {
    runtime.getLocale = fn
  },
}))

vi.mock('~/i18n/paraglide/messages', () => ({
  email_password_reset_subject: () => `subject (${runtime.getLocale()})`,
}))

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

const { runWithLocale } = await import('~/shared/utils/locale-scope.server')
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

// An email addressed to one account goes out in that account's language, whoever set it off: an
// admin who chose English inviting a member who follows a French congregation writes in French.
describe('sendResetAccountPasswordEmail — language', () => {
  async function sendFromSessionIn(sessionLocale: 'fr' | 'en', recipientLocale: string | null) {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      congregationId: 5,
      locale: recipientLocale,
    } as never)
    vi.mocked(resolveCongregation).mockResolvedValue({ emailFrom: 'x@test.org', locale: 'fr' } as never)
    let bodyLocale: string | undefined
    vi.mocked(sendEmail).mockImplementation(() => {
      // Resend renders the React body inside this call.
      bodyLocale = runtime.getLocale()
      return Promise.resolve(null)
    })

    await runWithLocale(sessionLocale, () => sendResetAccountPasswordEmail(1, 'email-template' as never))

    return { subject: vi.mocked(sendEmail).mock.calls[0][0].subject, bodyLocale }
  }

  it("writes in the congregation's language when the recipient follows it", async () => {
    await expect(sendFromSessionIn('en', null)).resolves.toEqual({ subject: 'subject (fr)', bodyLocale: 'fr' })
  })

  it("writes in the recipient's own language when it chose one", async () => {
    await expect(sendFromSessionIn('fr', 'en')).resolves.toEqual({ subject: 'subject (en)', bodyLocale: 'en' })
  })
})
