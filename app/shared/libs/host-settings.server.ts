export interface HostSettings {
  billing?: {
    portalUrl: string
    upgradeUrl: string
  }
  support?: {
    url: string
  }
  branding?: {
    platformName: string
  }
}

let cachedSettings: HostSettings | null = null

export function getHostSettings(): HostSettings {
  if (cachedSettings) return cachedSettings

  const raw = process.env.HOST_SETTINGS
  if (!raw) {
    cachedSettings = {}
    return cachedSettings
  }

  try {
    cachedSettings = JSON.parse(raw) as HostSettings
  } catch {
    cachedSettings = {}
  }

  return cachedSettings
}
