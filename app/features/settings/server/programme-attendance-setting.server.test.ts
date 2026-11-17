import { beforeEach, describe, expect, it, vi } from 'vitest'

const audit = vi.fn()
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { CongregationSettingsUpdated: 'congregation.settings_updated' },
  audit: (entry: unknown) => audit(entry),
}))
const setSetting = vi.fn()
const clearSetting = vi.fn()
vi.mock('~/shared/domain/settings.server', () => ({
  setSetting: (...args: unknown[]) => setSetting(...args),
  clearSetting: (...args: unknown[]) => clearSetting(...args),
}))

const { setProgrammeShowsAttendance } = await import('./programme-attendance-setting.server')

beforeEach(() => vi.clearAllMocks())

describe('setProgrammeShowsAttendance', () => {
  it('turns the programme’s attendance line on, and back off to the default, each time in the log', async () => {
    await setProgrammeShowsAttendance({} as never, 3, 9, true)
    expect(setSetting).toHaveBeenCalledWith({}, 'programme-shows-attendance', 'true', 3)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ congregationId: 3, actorId: 9, metadata: { programmeShowsAttendance: true } }),
    )

    await setProgrammeShowsAttendance({} as never, 3, 9, false)
    // Off is no setting at all: the default, as for a congregation that never chose.
    expect(clearSetting).toHaveBeenCalledWith({}, 'programme-shows-attendance', 3)
  })
})
