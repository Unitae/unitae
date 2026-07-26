import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/settings.server', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { CongregationSettingsUpdated: 'congregation.settings.updated' },
  audit: vi.fn(),
}))
vi.mock('~/shared/infra/logger.server', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { getPasswordSecurityScope, updatePasswordSecurityScope } = await import('./password-security.server')
const { getSetting, setSetting } = await import('~/shared/domain/settings.server')
const { audit } = await import('~/shared/domain/audit.server')
const logger = (await import('~/shared/infra/logger.server')).default

const db = {} as never

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getPasswordSecurityScope', () => {
  it('returns the stored scope when it is recognised', async () => {
    vi.mocked(getSetting).mockResolvedValue('everyone')

    const scope = await getPasswordSecurityScope(db, 10)

    expect(getSetting).toHaveBeenCalledWith(db, 'breached-password-check-scope', 10)
    expect(scope).toBe('everyone')
  })

  it('defaults to "off" without logging when the setting is simply unset', async () => {
    vi.mocked(getSetting).mockResolvedValue(undefined)

    expect(await getPasswordSecurityScope(db, 10)).toBe('off')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('defaults to "off" AND logs drift when a stored value is unrecognised', async () => {
    vi.mocked(getSetting).mockResolvedValue('garbage')

    expect(await getPasswordSecurityScope(db, 10)).toBe('off')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ tag: 'password-security', congregationId: 10, stored: 'garbage' }),
    )
  })
})

describe('updatePasswordSecurityScope', () => {
  it('persists the scope as a congregation setting when it changes', async () => {
    vi.mocked(getSetting).mockResolvedValue('off')
    vi.mocked(setSetting).mockResolvedValue(undefined as never)

    await updatePasswordSecurityScope(db, 10, 99, 'responsibilities')

    expect(setSetting).toHaveBeenCalledWith(db, 'breached-password-check-scope', 'responsibilities', 10)
  })

  it('audits the change with the scope in the metadata', async () => {
    vi.mocked(getSetting).mockResolvedValue('off')
    vi.mocked(setSetting).mockResolvedValue(undefined as never)

    await updatePasswordSecurityScope(db, 10, 99, 'everyone')

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'congregation.settings.updated',
        congregationId: 10,
        actorId: 99,
        metadata: { breachedPasswordCheckScope: 'everyone' },
      }),
    )
  })

  it('does not write or audit when the scope is unchanged (no audit noise)', async () => {
    vi.mocked(getSetting).mockResolvedValue('everyone')

    await updatePasswordSecurityScope(db, 10, 99, 'everyone')

    expect(setSetting).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
})
