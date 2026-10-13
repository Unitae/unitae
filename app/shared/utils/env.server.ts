import logger from '~/shared/infra/logger.server'

const MIN_SESSION_SECRET_LENGTH = 32
const PLACEHOLDER_SESSION_SECRETS = ['change-me-with-a-real-secret-key']
const DEFAULT_BASE_DOMAIN = 'unitae.app'

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

function parseHostname(value: string): string | null {
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname || null
  } catch {
    return null
  }
}

// The hostname in UNITAE_BASE_URL, whether it is written with a scheme, a port or a trailing slash
// or without. Non-throwing for the same reason as getSessionSecrets: it runs on every multi-tenant
// request, so validateEnv() reports a value that names no host once, at boot.
export function getBaseDomain(): string {
  return parseHostname(process.env.UNITAE_BASE_URL || DEFAULT_BASE_DOMAIN) ?? DEFAULT_BASE_DOMAIN
}

// Reported, not refused: an instance that only serves custom domains runs fine without a base
// domain, so a boot failure here would break setups that work.
function warnOnUnusableBaseUrl() {
  const baseUrl = process.env.UNITAE_BASE_URL
  if (process.env.UNITAE_MULTI_TENANT !== 'true' || baseUrl === undefined || parseHostname(baseUrl) != null) return

  logger.warn(
    `UNITAE_BASE_URL names no host: congregation subdomains are resolved against ${DEFAULT_BASE_DOMAIN}. ` +
      'Set it to your root domain, e.g. https://unitae.example.com.',
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

  warnOnUnusableBaseUrl()
}
