import { ValidationError } from '~/shared/errors/app-error.server'
import { getOptionalEnv } from '~/shared/utils/env.server'

/**
 * Public hosts that legitimately publish the French BANO / open-address CSV.
 * Self-hosters pointing at a private mirror extend this list through the
 * `UNITAE_OPEN_DATA_ALLOWLIST` env var (comma-separated hostnames).
 */
export const OPEN_DATA_DEFAULT_HOSTS = ['bano.openstreetmap.fr', 'adresse.data.gouv.fr', 'data.gouv.fr']

function getOpenDataAllowedHosts(): string[] {
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

  // Only the standard https port — an allowlisted host on an arbitrary port
  // could still reach an unintended service.
  if (url.port !== '' && url.port !== '443') {
    throw new ValidationError('bano-url', 'Port non autorisé pour la synchronisation des données ouvertes')
  }

  return url
}

/**
 * Write-path guard for the `bano-url` setting. Returns a French error message
 * to surface as a Conform field error, or null when the value is acceptable
 * (empty = feature disabled). Keeps the route action free of try/catch glue.
 */
export function banoUrlWriteError(value: string): string | null {
  if (value === '') return null
  try {
    assertAllowedOpenDataUrl(value)
    return null
  } catch (error) {
    return error instanceof ValidationError ? error.message : 'URL invalide'
  }
}
