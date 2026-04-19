import { timingSafeEqual } from 'node:crypto'

export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return false

  const token = auth.slice(7)
  if (token.length !== secret.length) return false

  return timingSafeEqual(Buffer.from(token), Buffer.from(secret))
}
