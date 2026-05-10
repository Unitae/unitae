import { unscopedDb as db } from '~/shared/infra/db.server'
import { redis } from '~/shared/infra/redis.server'

export async function loader() {
  try {
    await Promise.all([redis.ping(), db.userAccount.count()])

    return new Response('OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch (_error) {
    return new Response('Service Unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}
