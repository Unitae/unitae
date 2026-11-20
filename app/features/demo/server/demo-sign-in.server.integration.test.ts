import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { DEMO_ACCOUNTS_SETTING } from '~/features/demo/model/demo-role'
import { hashToken } from '~/shared/auth/crypto.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { redis, redisRateLimit } from '~/shared/infra/redis.server'

const { consumeDemoSignInToken, demoAccountFor } = await import('./demo-sign-in.server')

// Through the runtime role, inside a scope, as /demo/enter runs: the tenant RLS policy applies.
const testDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL, max: 2 }),
})
type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

function withScope<T>(congregationId: number, fn: (tx: Tx) => Promise<T>) {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

const ts = Date.now()
const NOW = new Date('2026-11-20T10:00:00Z')
const LATER = new Date(NOW.getTime() + 60_000)
let copyA: number
let copyB: number
let loginA: number
let loginB: number

function writeToken(congregationId: number, raw: string, expiresAt = LATER, role = 'secretary') {
  return withScope(congregationId, tx =>
    tx.demoSignInToken.create({ data: { token: hashToken(raw), role, expiresAt, congregationId } }),
  )
}

beforeAll(async () => {
  const create = (suffix: string) =>
    testDb.congregation.create({
      data: { name: `Demo ${suffix} ${ts}`, slug: `demo-it-${suffix}-${ts}`, active: true, demoExpiresAt: LATER },
    })
  copyA = (await create('a')).id
  copyB = (await create('b')).id
  const login = (congregationId: number, suffix: string) =>
    withScope(congregationId, async tx => {
      const account = await tx.userAccount.create({
        data: { email: `demo-it-${suffix}-${ts}@demo.unitae.app`, password: 'hashed', active: true, congregationId },
      })
      await tx.setting.create({
        data: { key: DEMO_ACCOUNTS_SETTING, value: JSON.stringify({ secretary: account.id }), congregationId },
      })
      return account.id
    })
  loginA = await login(copyA, 'a')
  loginB = await login(copyB, 'b')
})

afterAll(async () => {
  for (const id of [copyA, copyB]) {
    await withScope(id, async tx => {
      await tx.demoSignInToken.deleteMany({})
      await tx.setting.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [copyA, copyB] } } })
  await testDb.$disconnect()
  redisRateLimit.disconnect()
  redis.disconnect()
  await unscopedDb.$disconnect()
})

describe('consumeDemoSignInToken (integration)', () => {
  it('opens the role once, then refuses the same link', async () => {
    await writeToken(copyA, `once-${ts}`)

    expect(await withScope(copyA, tx => consumeDemoSignInToken(tx, `once-${ts}`, copyA, NOW))).toBe('secretary')
    expect(await withScope(copyA, tx => consumeDemoSignInToken(tx, `once-${ts}`, copyA, NOW))).toBeNull()
  })

  it('refuses an expired link', async () => {
    await writeToken(copyA, `expired-${ts}`, NOW)

    expect(await withScope(copyA, tx => consumeDemoSignInToken(tx, `expired-${ts}`, copyA, NOW))).toBeNull()
  })

  it("refuses another copy's link, and leaves it unspent", async () => {
    await writeToken(copyB, `other-${ts}`)

    // Opened on copy A's address: the scope is A's, so B's row is out of sight whatever id the caller passes.
    expect(await withScope(copyA, tx => consumeDemoSignInToken(tx, `other-${ts}`, copyA, NOW))).toBeNull()
    expect(await withScope(copyA, tx => consumeDemoSignInToken(tx, `other-${ts}`, copyB, NOW))).toBeNull()
    expect(await withScope(copyB, tx => consumeDemoSignInToken(tx, `other-${ts}`, copyB, NOW))).toBe('secretary')
  })

  it('refuses a role the demo does not have', async () => {
    await writeToken(copyA, `role-${ts}`, LATER, 'treasurer')

    expect(await withScope(copyA, tx => consumeDemoSignInToken(tx, `role-${ts}`, copyA, NOW))).toBeNull()
  })
})

describe('demoAccountFor (integration)', () => {
  it("gives the copy's own login for the role", async () => {
    expect(await withScope(copyA, tx => demoAccountFor(tx, copyA, 'secretary'))).toBe(loginA)
  })

  it("never gives another copy's login, even when the setting names it", async () => {
    await withScope(copyA, tx =>
      tx.setting.updateMany({
        where: { key: DEMO_ACCOUNTS_SETTING },
        data: { value: JSON.stringify({ secretary: loginB }) },
      }),
    )

    expect(await withScope(copyA, tx => demoAccountFor(tx, copyA, 'secretary'))).toBeNull()
  })
})
