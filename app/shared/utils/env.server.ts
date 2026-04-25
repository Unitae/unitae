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
  requireEnv('DATABASE_URL')
  requireEnv('SESSION_SECRET')

  if (!process.env.DATABASE_APP_URL) {
    logger.warn('DATABASE_APP_URL is not set — RLS enforcement requires a non-superuser database role.')
  }

  if (!process.env.CRON_SECRET) {
    logger.warn('CRON_SECRET is not set. Cron endpoints will reject all requests.')
  }
}

validateEnv()
