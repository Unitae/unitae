import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./password-strength.server', () => ({ evaluatePasswordStrength: vi.fn() }))
vi.mock('./breached-password.server', () => ({ isPasswordBreached: vi.fn() }))

const { checkNewPasswordPolicy } = await import('./password-policy.server')
const { evaluatePasswordStrength } = await import('./password-strength.server')
const { isPasswordBreached } = await import('./breached-password.server')

function strength(weak: boolean) {
  vi.mocked(evaluatePasswordStrength).mockReturnValue({ score: weak ? 1 : 3, weak })
}

beforeEach(() => {
  vi.resetAllMocks()
  strength(false)
  vi.mocked(isPasswordBreached).mockResolvedValue(false)
})

describe('checkNewPasswordPolicy', () => {
  it('returns a message when the password is too weak', async () => {
    strength(true)

    expect(await checkNewPasswordPolicy('weak', { checkBreached: false })).not.toBeNull()
  })

  it('returns null for a strong password when breach-checking is off', async () => {
    strength(false)

    expect(await checkNewPasswordPolicy('a-strong-passphrase', { checkBreached: false })).toBeNull()
  })

  it('returns a message when the password is strong but breached and breach-checking is on', async () => {
    strength(false)
    vi.mocked(isPasswordBreached).mockResolvedValue(true)

    expect(await checkNewPasswordPolicy('leaked-but-strong', { checkBreached: true })).not.toBeNull()
  })

  it('returns null for a strong, unbreached password when breach-checking is on', async () => {
    strength(false)
    vi.mocked(isPasswordBreached).mockResolvedValue(false)

    expect(await checkNewPasswordPolicy('a-strong-passphrase', { checkBreached: true })).toBeNull()
  })

  it('does not fail a breached password when breach-checking is off', async () => {
    strength(false)
    vi.mocked(isPasswordBreached).mockResolvedValue(true)

    expect(await checkNewPasswordPolicy('leaked-but-strong', { checkBreached: false })).toBeNull()
  })

  it('reports weakness before breach — a weak password fails with its own message even when breached', async () => {
    strength(false)
    vi.mocked(isPasswordBreached).mockResolvedValue(true)
    const breachMessage = await checkNewPasswordPolicy('leaked-but-strong', { checkBreached: true })

    strength(true)
    const weakMessage = await checkNewPasswordPolicy('weak', { checkBreached: true })

    expect(weakMessage).not.toBeNull()
    expect(weakMessage).not.toBe(breachMessage)
  })
})
