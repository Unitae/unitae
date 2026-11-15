import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  },
}))

const { getGeneralSettings, updateGeneralSettings } = await import('./general-settings.server')
const { unscopedDb } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(unscopedDb.congregation.findUniqueOrThrow).mockResolvedValue({ name: 'Les Lilas' } as never)
  vi.mocked(unscopedDb.congregation.update).mockResolvedValue({} as never)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getGeneralSettings', () => {
  const registered = {
    name: 'Les Lilas',
    slug: 'les-lilas',
    displayName: null,
    locale: 'fr',
    timezone: 'Europe/Paris',
    domain: null,
  }

  it('shows the name of a congregation created through the control plane, which has no display name', async () => {
    vi.mocked(unscopedDb.congregation.findUniqueOrThrow).mockResolvedValue(registered as never)

    const settings = await getGeneralSettings(10)

    expect(settings.displayName).toBe('Les Lilas')
    expect(settings.domain).toBe('')
  })

  it('shows the display name when one overrides the name', async () => {
    vi.mocked(unscopedDb.congregation.findUniqueOrThrow).mockResolvedValue({
      ...registered,
      displayName: 'Assemblée des Lilas',
      domain: 'app.lilas.org',
    } as never)

    const settings = await getGeneralSettings(10)

    expect(settings.displayName).toBe('Assemblée des Lilas')
    expect(settings.domain).toBe('app.lilas.org')
  })

  it('gives the subdomain the app opens at in multi-tenant mode', async () => {
    vi.stubEnv('UNITAE_MULTI_TENANT', 'true')
    vi.stubEnv('UNITAE_BASE_URL', 'https://unitae.app')
    vi.mocked(unscopedDb.congregation.findUniqueOrThrow).mockResolvedValue(registered as never)

    const settings = await getGeneralSettings(10)

    expect(settings.address).toBe('les-lilas.unitae.app')
  })

  it('gives no subdomain on a single-tenant instance', async () => {
    vi.stubEnv('UNITAE_MULTI_TENANT', 'false')
    vi.mocked(unscopedDb.congregation.findUniqueOrThrow).mockResolvedValue(registered as never)

    const settings = await getGeneralSettings(10)

    expect(settings.address).toBeNull()
  })
})

describe('updateGeneralSettings', () => {
  it('updates congregation with provided values', async () => {
    await updateGeneralSettings(10, {
      displayName: 'Assemblée des Lilas',
      locale: 'fr',
      timezone: 'Europe/Paris',
      domain: 'app.example.org',
    })

    expect(unscopedDb.congregation.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        displayName: 'Assemblée des Lilas',
        locale: 'fr',
        timezone: 'Europe/Paris',
        domain: 'app.example.org',
      },
    })
  })

  it('coerces empty displayName to null', async () => {
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

  it('keeps no override when the name is saved unchanged, so a later rename still shows', async () => {
    await updateGeneralSettings(10, {
      displayName: ' Les Lilas ',
      locale: 'fr',
      timezone: 'Europe/Paris',
      domain: null,
    })

    expect(unscopedDb.congregation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayName: null }) }),
    )
  })

  it('passes null domain when cleared', async () => {
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
