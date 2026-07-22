import logger from '~/shared/infra/logger.server'

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

export function validateEnv() {
  requireEnv('DB_URL')
  requireEnv('UNITAE_SESSION_SECRET')

  // DB_RUNTIME_URL / RLS enforceability is validated at boot by assertRuntimeRoleEnforcesRls
  // (see ~/shared/infra/rls-guard.server), which probes the connected role and fails closed
  // in production. It needs an async DB query, so it lives outside this synchronous check.

  if (!process.env.UNITAE_CRON_SECRET) {
    logger.warn('UNITAE_CRON_SECRET is not set. Cron endpoints will reject all requests.')
  }
}

validateEnv()
