import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { update: vi.fn() },
  },
}))

const { updateGeneralSettings } = await import('./general-settings.server')
const { unscopedDb } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updateGeneralSettings', () => {
  it('updates congregation with provided values', async () => {
    vi.mocked(unscopedDb.congregation.update).mockResolvedValue({} as never)

    await updateGeneralSettings(10, {
      displayName: 'Ma Congrégation',
      locale: 'fr',
      timezone: 'Europe/Paris',
      domain: 'app.example.org',
    })

    expect(unscopedDb.congregation.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        displayName: 'Ma Congrégation',
        locale: 'fr',
        timezone: 'Europe/Paris',
        domain: 'app.example.org',
      },
    })
  })

  it('coerces empty displayName to null', async () => {
    vi.mocked(unscopedDb.congregation.update).mockResolvedValue({} as never)

    await updateGeneralSettings(10, {
      displayName: '',
      locale: 'en',
      timezone: 'America/New_York',
      domain: null,
    })

    expect(unscopedDb.congregation.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        displayName: null,
        locale: 'en',
        timezone: 'America/New_York',
        domain: null,
      },
    })
  })

  it('passes null domain when cleared', async () => {
    vi.mocked(unscopedDb.congregation.update).mockResolvedValue({} as never)

    await updateGeneralSettings(10, {
      displayName: 'Test',
      locale: 'fr',
      timezone: 'Europe/Paris',
      domain: null,
    })

    expect(unscopedDb.congregation.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        displayName: 'Test',
        locale: 'fr',
        timezone: 'Europe/Paris',
        domain: null,
      },
    })
  })
})
