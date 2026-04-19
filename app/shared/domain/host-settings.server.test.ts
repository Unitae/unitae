import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
})
