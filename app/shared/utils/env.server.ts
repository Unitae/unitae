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

// Enforces that every configured session secret (current + any rotated previous ones) is long
// enough and is not the shipped placeholder. Fails closed in production; warns in development so
// local setups keep working. Presence is checked first via requireEnv.
function validateSessionSecret() {
  requireEnv('UNITAE_SESSION_SECRET')

  const problems: string[] = []
  for (const secret of getSessionSecrets()) {
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
}
