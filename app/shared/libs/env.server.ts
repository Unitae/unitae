function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function validateEnv() {
  requireEnv('DATABASE_URL')
  requireEnv('SESSION_SECRET')
}

validateEnv()
