import logger from '~/shared/infra/logger.server'

const MIN_SESSION_SECRET_LENGTH = 32
const PLACEHOLDER_SESSION_SECRETS = ['change-me-with-a-real-secret-key']

// Fail closed: treat anything that is not an explicit development/test environment (including an
// unset or misspelled NODE_ENV) as production, mirroring the RLS guard (see rls-guard.server.ts).
function isProductionEnv(): boolean {
  return !['development', 'test'].includes(process.env.NODE_ENV ?? '')
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getOptionalEnv(name: string): string | undefined {
  return process.env[name] || undefined
}

// Parses UNITAE_SESSION_SECRET into [current, ...previous]. The value is comma-separated:
// the first entry signs new cookies, the rest still validate existing cookies and decrypt
// enrolled 2FA seeds (see rotation support). Non-throwing on purpose — it runs at module-load
// time in session.server.ts, so length/placeholder enforcement lives in validateEnv() instead.
export function getSessionSecrets(): string[] {
  return (process.env.UNITAE_SESSION_SECRET ?? '')
    .split(',')
    .map(secret => secret.trim())
    .filter(Boolean)
}

// The origin a value names, whether it is written with a scheme, a port or a trailing slash or without (a bare host
// is read as https). Null for a value that names no host.
function parseOrigin(value: string): string | null {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    if (!url.hostname || !['http:', 'https:'].includes(url.protocol)) return null
    return url.origin
  } catch {
    return null
  }
}

// The server itself, on the port the start script listens to (`react-router dev` serves on 5173). Never another
// instance's domain: an instance that forgot UNITAE_BASE_URL keeps its links, and the tokens in them, at home.
function fallbackBaseUrl(): string {
  const port =
    process.env.UNITAE_WEB_PORT || process.env.PORT || (process.env.NODE_ENV === 'development' ? '5173' : '3000')
  return `http://localhost:${port}`
}

/**
 * The address people reach this instance at, as an origin (`https://unitae.example.com`): the links in emails and
 * shared messages, the domain tenant subdomains hang from and the default sender all derive from it. Always a value:
 * UNITAE_BASE_URL when it names a host, the server itself otherwise. Never read from a request: a forged Host header
 * would send a password-reset link to someone else's site. Non-throwing for the same reason as getSessionSecrets;
 * validateEnv() reports a missing or unusable value once, at boot.
 */
export function getBaseUrl(): string {
  const configured = process.env.UNITAE_BASE_URL
  return (configured && parseOrigin(configured)) || fallbackBaseUrl()
}

/** The hostname of {@link getBaseUrl}: what tenant subdomains are resolved against. */
export function getBaseDomain(): string {
  return new URL(getBaseUrl()).hostname
}

// Reported, not refused: the instance works without it, only its links point at the server itself.
function warnOnMissingBaseUrl() {
  const configured = process.env.UNITAE_BASE_URL
  if (configured && parseOrigin(configured) != null) return
  if (!configured && !isProductionEnv()) return

  const problem = configured
    ? `UNITAE_BASE_URL names no host (${JSON.stringify(configured)})`
    : 'UNITAE_BASE_URL is not set'
  logger.warn(
    `${problem}: links in emails and shared messages point to ${fallbackBaseUrl()}. ` +
      'Set it to the address people use to reach this instance, e.g. https://unitae.example.com.',
  )
}

// Enforces that every configured session secret (current + any rotated previous ones) is long
// enough and is not the shipped placeholder. Fails closed in production; warns in development so
// local setups keep working. Presence is checked first via requireEnv.
function validateSessionSecret() {
  requireEnv('UNITAE_SESSION_SECRET')

  const secrets = getSessionSecrets()
  // requireEnv only checks the raw string is truthy, but the parser trims and drops empty
  // segments — so a delimiter/whitespace-only value like "," or "   " passes presence yet yields
  // no usable secret. An empty array disables cookie signing entirely (react-router treats
  // `secrets: []` as unsigned), so refuse it in every environment, not just production.
  if (secrets.length === 0) {
    throw new Error('UNITAE_SESSION_SECRET must contain at least one non-empty secret')
  }

  const problems: string[] = []
  for (const secret of secrets) {
    if (secret.length < MIN_SESSION_SECRET_LENGTH) {
      problems.push(`must be at least ${MIN_SESSION_SECRET_LENGTH} characters (got ${secret.length})`)
    }
    if (PLACEHOLDER_SESSION_SECRETS.includes(secret)) {
      problems.push('must not be the example placeholder value')
    }
  }

  if (problems.length === 0) return

  const message = `UNITAE_SESSION_SECRET is insecure: ${[...new Set(problems)].join('; ')}`
  if (isProductionEnv()) {
    throw new Error(message)
  }
  logger.warn(`${message} — allowed in ${process.env.NODE_ENV ?? 'unknown'}, but refused in production`)
}

export function validateEnv() {
  requireEnv('DB_URL')
  validateSessionSecret()

  // DB_RUNTIME_URL / RLS enforceability is validated at boot by assertRuntimeRoleEnforcesRls
  // (see ~/shared/infra/rls-guard.server), which probes the connected role and fails closed
  // in production. It needs an async DB query, so it lives outside this synchronous check.

  if (!process.env.UNITAE_CRON_SECRET) {
    logger.warn('UNITAE_CRON_SECRET is not set. Cron endpoints will reject all requests.')
  }

  warnOnMissingBaseUrl()
}
