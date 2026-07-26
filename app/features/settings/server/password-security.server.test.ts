import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/settings.server', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { CongregationSettingsUpdated: 'congregation.settings.updated' },
  audit: vi.fn(),
}))

const { getPasswordSecurityScope, updatePasswordSecurityScope } = await import('./password-security.server')
const { getSetting, setSetting } = await import('~/shared/domain/settings.server')
const { audit } = await import('~/shared/domain/audit.server')

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

  it('defaults to "off" when the setting is unset or unrecognised', async () => {
    vi.mocked(getSetting).mockResolvedValue(undefined)
    expect(await getPasswordSecurityScope(db, 10)).toBe('off')

    vi.mocked(getSetting).mockResolvedValue('garbage')
    expect(await getPasswordSecurityScope(db, 10)).toBe('off')
  })
})

describe('updatePasswordSecurityScope', () => {
  it('persists the scope as a congregation setting', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)

    await updatePasswordSecurityScope(db, 10, 99, 'responsibilities')

    expect(setSetting).toHaveBeenCalledWith(db, 'breached-password-check-scope', 'responsibilities', 10)
  })

  it('audits the change with the scope in the metadata', async () => {
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
})
