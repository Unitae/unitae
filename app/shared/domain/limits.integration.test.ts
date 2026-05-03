import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { createTestCongregation, createTestUser } from '~/tests/factories'
import { LimitService } from './limits.server'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

function withScope<T>(
  congregationId: number,
  fn: (tx: Parameters<Parameters<typeof testDb.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

let congregationId: number

beforeAll(async () => {
  const cong = await createTestCongregation(testDb)
  congregationId = cong.id
  await createTestUser(testDb, congregationId, { isPublisher: true })
  await createTestUser(testDb, congregationId, { isPublisher: true })
})

afterAll(async () => {
  await testDb.user.deleteMany({ where: { congregationId } })
  await testDb.congregation.deleteMany({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('LimitService', () => {
  it('ne bloque pas quand la limite est null (illimitée)', async () => {
    await withScope(congregationId, async tx => {
      const limits = new LimitService(tx, {
        maxPublishers: null,
        maxTerritories: null,
        maxUsers: null,
        maxStorageBytes: null,
        maxBoardDocuments: null,
        maxCardOverlays: null,
      })
      await expect(limits.errorIfWouldGoOverLimit('publishers')).resolves.toBeUndefined()
    })
  })

  it('bloque quand le nombre actuel atteint la limite', async () => {
    await withScope(congregationId, async tx => {
      const limits = new LimitService(tx, {
        maxPublishers: 2,
        maxTerritories: null,
        maxUsers: null,
        maxStorageBytes: null,
        maxBoardDocuments: null,
        maxCardOverlays: null,
      })
      await expect(limits.errorIfWouldGoOverLimit('publishers')).rejects.toThrow()
    })
  })

  it('passe quand le nombre actuel est sous la limite', async () => {
    await withScope(congregationId, async tx => {
      const limits = new LimitService(tx, {
        maxPublishers: 100,
        maxTerritories: null,
        maxUsers: null,
        maxStorageBytes: null,
        maxBoardDocuments: null,
        maxCardOverlays: null,
      })
      await expect(limits.errorIfWouldGoOverLimit('publishers')).resolves.toBeUndefined()
    })
  })
})
