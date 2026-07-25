import { createHash } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Round-trip guard: every unit test in this feature mocks `unscopedDb`, so none
// of them prove that hashing at write time and hashing at read time resolve to
// the SAME stored row. If the two `hashToken` call sites ever diverged (different
// algorithm/encoding), the mocked tests would still pass while password reset would
// be 100% broken in production. This test exercises the real DB end-to-end.

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

function withScope<T>(congregationId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

const ts = Date.now()
let congregationId: number
let userId: number

const { createPasswordResetToken, verifyPasswordResetToken, consumePasswordResetToken } = await import(
  './invalidate-account-password.server'
)

beforeAll(async () => {
  const congregation = await testDb.congregation.create({
    data: { name: `ResetToken ${ts}`, slug: `reset-token-${ts}`, active: true },
  })
  congregationId = congregation.id

  await withScope(congregationId, async tx => {
    const user = await tx.userAccount.create({
      data: {
        email: `reset-token-${ts}@test.com`,
        password: 'hashed',
        active: true,
        congregationId,
      },
    })
    userId = user.id
  })
})

afterAll(async () => {
  await testDb.passwordResetToken.deleteMany({ where: { userId } })
  await withScope(congregationId, tx => tx.userAccount.deleteMany({}))
  await testDb.congregation.deleteMany({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('password reset token hashing (integration)', () => {
  it('persists the hash, not the raw token, but the raw token resolves the account', async () => {
    const rawToken = await createPasswordResetToken(userId)

    // The DB never holds the token that was emailed to the user.
    const stored = await testDb.passwordResetToken.findFirst({ where: { userId } })
    expect(stored?.token).toBe(sha256(rawToken))
    expect(stored?.token).not.toBe(rawToken)
    expect(stored?.token).toHaveLength(64)

    // The raw token from the email round-trips back to the account.
    const account = await verifyPasswordResetToken(rawToken)
    expect(account?.id).toBe(userId)
  })

  it('rejects a token that does not hash to a stored value', async () => {
    await createPasswordResetToken(userId)

    const account = await verifyPasswordResetToken('not-the-real-token')
    expect(account).toBeNull()
  })

  it('consuming the raw token deletes the stored hash (single-use)', async () => {
    const rawToken = await createPasswordResetToken(userId)

    await consumePasswordResetToken(rawToken)

    const stored = await testDb.passwordResetToken.findFirst({ where: { userId } })
    expect(stored).toBeNull()
  })
})
