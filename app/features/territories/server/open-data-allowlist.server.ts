import { ValidationError } from '~/shared/errors/app-error.server'
import { getOptionalEnv } from '~/shared/utils/env.server'

/**
 * Public hosts that legitimately publish the French BANO / open-address CSV.
 * Self-hosters pointing at a private mirror extend this list through the
 * `UNITAE_OPEN_DATA_ALLOWLIST` env var (comma-separated hostnames).
 */
export const OPEN_DATA_DEFAULT_HOSTS = ['bano.openstreetmap.fr', 'adresse.data.gouv.fr', 'data.gouv.fr']

export function getOpenDataAllowedHosts(): string[] {
  const extra = (getOptionalEnv('UNITAE_OPEN_DATA_ALLOWLIST') ?? '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(host => host.length > 0)

  return [...OPEN_DATA_DEFAULT_HOSTS, ...extra]
}

/**
 * Parse and vet an open-data URL. Rejects anything that is not an `https` URL
 * on an allowlisted host — the primary SSRF control at both the write path and
 * the fetch path. Returns the parsed URL for the caller to reuse.
 */
export function assertAllowedOpenDataUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ValidationError('bano-url', 'URL invalide')
  }

  if (url.protocol !== 'https:') {
    throw new ValidationError('bano-url', 'URL invalide (https requis)')
  }

  if (!getOpenDataAllowedHosts().includes(url.hostname.toLowerCase())) {
    throw new ValidationError('bano-url', 'Hôte non autorisé pour la synchronisation des données ouvertes')
  }

  return url
}
