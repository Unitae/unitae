import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { redis, redisRateLimit } from '~/shared/infra/redis.server'

const { requestPasswordReset } = await import('./request-password-reset.server')

// Unique per run so the counters start clean and never collide with a parallel suite.
const ts = Date.now()
const UNKNOWN_EMAIL = `reset-unknown-${ts}@nowhere.test`
const KNOWN_EMAIL = `reset-known-${ts}@test.com`
// Distinct documentation-range addresses so the per-client counters do not interfere.
const UNKNOWN_CLIENT = `203.0.113.${ts % 250}`
const KNOWN_CLIENT = `198.51.100.${ts % 250}`

const rateLimitKeys = [
  `password_reset:window:ip:${UNKNOWN_CLIENT}`,
  `password_reset:window:ip:${KNOWN_CLIENT}`,
  ...[UNKNOWN_EMAIL, KNOWN_EMAIL].flatMap(email => [
    `password_reset:window:email:${email}`,
    `password_reset:day:email:${email}`,
  ]),
]

// The account is created through the runtime role, inside a scope, like the app does.
const testDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL, max: 2 }),
})

function withScope<T>(
  congregationId: number,
  fn: (tx: Parameters<Parameters<typeof testDb.$transaction>[0]>[0]) => Promise<T>,
) {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

let congregationId: number
let userId: number

beforeAll(async () => {
  await redisRateLimit.del(...rateLimitKeys)
  const congregation = await testDb.congregation.create({
    data: { name: `ResetRequest ${ts}`, slug: `reset-request-${ts}`, active: true },
  })
  congregationId = congregation.id
  const user = await withScope(congregationId, tx =>
    tx.userAccount.create({ data: { email: KNOWN_EMAIL, password: 'hashed', active: true, congregationId } }),
  )
  userId = user.id
})

afterAll(async () => {
  await redisRateLimit.del(...rateLimitKeys)
  await testDb.passwordResetToken.deleteMany({ where: { userId } })
  // A processed request writes an audit entry (fire-and-forget): let it land, then remove it.
  await flushPendingAuditWrites()
  await withScope(congregationId, tx => tx.auditLog.deleteMany({}))
  await withScope(congregationId, tx => tx.userAccount.deleteMany({}))
  await testDb.congregation.deleteMany({ where: { id: congregationId } })
  await testDb.$disconnect()
  redisRateLimit.disconnect()
  redis.disconnect()
  await unscopedDb.$disconnect()
})

describe('requestPasswordReset (integration)', () => {
  it('counts every request on an unknown address and ends up limiting it', async () => {
    // An unknown address must still consume the reset budget — otherwise the presence
    // or absence of rate-limiting is itself an account-enumeration oracle.
    const statuses: string[] = []
    for (let i = 0; i < 4; i++) {
      statuses.push((await requestPasswordReset(UNKNOWN_EMAIL, UNKNOWN_CLIENT)).status)
    }

    expect(statuses).toEqual(['no-user', 'no-user', 'no-user', 'rate-limited'])
  })

  // A second request must not cancel the link the user may already be opening.
  it('keeps the first link pending when the user asks for another one', async () => {
    await requestPasswordReset(KNOWN_EMAIL, KNOWN_CLIENT)
    await requestPasswordReset(KNOWN_EMAIL, KNOWN_CLIENT)

    expect(await testDb.passwordResetToken.count({ where: { userId } })).toBe(2)
  })
})
