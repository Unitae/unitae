import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { CongregationSettingsUpdated: 'congregation.settings_updated' },
  audit: vi.fn(),
}))
const setSetting = vi.fn()
const clearSetting = vi.fn()
vi.mock('~/shared/domain/settings.server', () => ({
  setSetting: (...args: unknown[]) => setSetting(...args),
  clearSetting: (...args: unknown[]) => clearSetting(...args),
}))

const { updateExternalSpeakerSettings } = await import('./external-speaker-settings.server')
const { NotFoundError } = await import('~/shared/errors/app-error.server')

const db = { role: { findFirst: vi.fn() } }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updateExternalSpeakerSettings', () => {
  it('stores the two roles by key, which an archive keeps', async () => {
    db.role.findFirst.mockImplementation(({ where }) => Promise.resolve({ key: where.key }))

    await updateExternalSpeakerSettings(db as never, 1, 99, {
      candidatesRoleKey: 'orateurs-publics',
      responsibleRoleKey: 'coord-discours',
    })

    expect(setSetting.mock.calls.map(call => [call[1], call[2]])).toEqual([
      ['external-speakers-candidates-role', 'orateurs-publics'],
      ['external-speakers-responsible-role', 'coord-discours'],
    ])
  })

  it('clears a role set back to none', async () => {
    db.role.findFirst.mockResolvedValue({ key: 'orateurs-publics' })

    await updateExternalSpeakerSettings(db as never, 1, 99, {
      candidatesRoleKey: 'orateurs-publics',
      responsibleRoleKey: null,
    })

    expect(clearSetting.mock.calls.map(call => call[1])).toEqual(['external-speakers-responsible-role'])
  })

  it('refuses a role the congregation does not have', async () => {
    db.role.findFirst.mockResolvedValue(null)

    await expect(
      updateExternalSpeakerSettings(db as never, 1, 99, { candidatesRoleKey: 'ghost', responsibleRoleKey: null }),
    ).rejects.toThrow(NotFoundError)
    expect(setSetting).not.toHaveBeenCalled()
  })

  it('refuses the system admin role as candidates', async () => {
    await expect(
      updateExternalSpeakerSettings(db as never, 1, 99, { candidatesRoleKey: 'admin', responsibleRoleKey: null }),
    ).rejects.toThrow(NotFoundError)
  })

  it('refuses the roles the picker never offers: those synced from the records, and the service committee', async () => {
    db.role.findFirst.mockImplementation(({ where }) => Promise.resolve({ key: where.key }))

    for (const key of ['elder', 'publisher', 'service-committee']) {
      await expect(
        updateExternalSpeakerSettings(db as never, 1, 99, { candidatesRoleKey: key, responsibleRoleKey: null }),
      ).rejects.toThrow(NotFoundError)
    }
    expect(setSetting).not.toHaveBeenCalled()
  })
})
