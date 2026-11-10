import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/logger.server', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

describe('getHostSettings', () => {
  const originalEnv = process.env.HOST_SETTINGS

  beforeEach(() => {
    // Chaque test a besoin d'un module frais pour réinitialiser le cache
    vi.resetModules()
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.HOST_SETTINGS = originalEnv
    } else {
      delete process.env.HOST_SETTINGS
    }
  })

  it("retourne un objet vide quand HOST_SETTINGS n'est pas défini", async () => {
    delete process.env.HOST_SETTINGS
    const { getHostSettings } = await import('./host-settings.server')

    expect(getHostSettings()).toEqual({})
  })

  it('parse le JSON de HOST_SETTINGS', async () => {
    process.env.HOST_SETTINGS = JSON.stringify({
      billing: { portalUrl: 'https://billing.example.com', upgradeUrl: 'https://upgrade.example.com' },
      support: { url: 'https://support.example.com' },
    })
    const { getHostSettings } = await import('./host-settings.server')

    const result = getHostSettings()
    expect(result.billing?.portalUrl).toBe('https://billing.example.com')
    expect(result.support?.url).toBe('https://support.example.com')
  })

  it('retourne un objet vide pour du JSON invalide', async () => {
    process.env.HOST_SETTINGS = 'not-valid-json'
    const { getHostSettings } = await import('./host-settings.server')

    expect(getHostSettings()).toEqual({})
  })

  it('met en cache le résultat entre les appels', async () => {
    process.env.HOST_SETTINGS = JSON.stringify({ branding: { platformName: 'TestApp' } })
    const { getHostSettings } = await import('./host-settings.server')

    const first = getHostSettings()
    // Même si on change l'env, le cache retourne le même résultat
    process.env.HOST_SETTINGS = JSON.stringify({ branding: { platformName: 'Changed' } })
    const second = getHostSettings()

    expect(first).toBe(second) // même référence (cache)
    expect(first.branding?.platformName).toBe('TestApp')
  })

  it('keeps what tells one instance from another: its site and who runs it', async () => {
    process.env.HOST_SETTINGS = JSON.stringify({
      branding: { platformName: 'Assemblées du Rhône', homeUrl: 'https://assemblees-rhone.org' },
      operator: {
        name: 'Assemblées du Rhône',
        privacyContact: 'dpo@assemblees-rhone.org',
        privacyPolicyUrl: 'https://assemblees-rhone.org/confidentialite',
      },
    })
    const { getHostSettings } = await import('./host-settings.server')

    expect(getHostSettings()).toEqual({
      branding: { platformName: 'Assemblées du Rhône', homeUrl: 'https://assemblees-rhone.org' },
      operator: {
        name: 'Assemblées du Rhône',
        privacyContact: 'dpo@assemblees-rhone.org',
        privacyPolicyUrl: 'https://assemblees-rhone.org/confidentialite',
      },
    })
  })

  it.each(['javascript:alert(1)', 'assemblees-rhone.org', 'ftp://assemblees-rhone.org', 42])(
    'drops a link that is not a web address (%j), keeping the rest',
    async homeUrl => {
      process.env.HOST_SETTINGS = JSON.stringify({ branding: { platformName: 'Rhône', homeUrl } })
      const { getHostSettings } = await import('./host-settings.server')

      expect(getHostSettings()).toEqual({ branding: { platformName: 'Rhône' } })
    },
  )

  it('drops a privacy contact that is not an email address', async () => {
    process.env.HOST_SETTINGS = JSON.stringify({ operator: { name: 'Rhône', privacyContact: 'écrivez-nous' } })
    const { getHostSettings } = await import('./host-settings.server')

    expect(getHostSettings()).toEqual({ operator: { name: 'Rhône' } })
  })

  // Only the managed hosting describes its own processor, subprocessors and transfers: anything short of `true`
  // must leave an instance described as self-hosted.
  it.each(['true', 1, 'yes'])('reads managedHosting %j as not set', async managedHosting => {
    process.env.HOST_SETTINGS = JSON.stringify({ operator: { name: 'Rhône', managedHosting } })
    const { getHostSettings } = await import('./host-settings.server')

    expect(getHostSettings()).toEqual({ operator: { name: 'Rhône' } })
  })

  it('keeps managedHosting when it is true', async () => {
    process.env.HOST_SETTINGS = JSON.stringify({ operator: { managedHosting: true } })
    const { getHostSettings } = await import('./host-settings.server')

    expect(getHostSettings().operator?.managedHosting).toBe(true)
  })

  it('drops the billing links when one of the two is not a web address', async () => {
    process.env.HOST_SETTINGS = JSON.stringify({
      billing: { portalUrl: 'https://billing.example.com', upgradeUrl: '/checkout' },
      support: { url: 'https://support.example.com' },
    })
    const { getHostSettings } = await import('./host-settings.server')

    expect(getHostSettings()).toEqual({ support: { url: 'https://support.example.com' } })
  })

  it.each(['[]', '"unitae"', 'null'])('returns an empty object for JSON that is not an object (%s)', async raw => {
    process.env.HOST_SETTINGS = raw
    const { getHostSettings } = await import('./host-settings.server')

    expect(getHostSettings()).toEqual({})
  })
})
