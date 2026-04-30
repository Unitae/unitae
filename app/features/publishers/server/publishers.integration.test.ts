import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { CongregationId, UserId } from '~/shared/types/branded'
import { createTestCongregation, createTestUser } from '~/tests/factories'
import { getPublisherById } from './publishers.server'

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

let congregationIdA: number
let congregationIdB: number
let publisherIdA: number

const serviceYearStart = new Date().getFullYear()

beforeAll(async () => {
  const congA = await createTestCongregation(testDb)
  const congB = await createTestCongregation(testDb)
  congregationIdA = congA.id
  congregationIdB = congB.id

  const userA = await createTestUser(testDb, congregationIdA, { isPublisher: true })
  publisherIdA = userA.id
  await createTestUser(testDb, congregationIdB, { isPublisher: true })
})

afterAll(async () => {
  await testDb.user.deleteMany({ where: { congregationId: { in: [congregationIdA, congregationIdB] } } })
  await testDb.congregation.deleteMany({ where: { id: { in: [congregationIdA, congregationIdB] } } })
  await testDb.$disconnect()
})

describe('getPublisherById', () => {
  it('retourne le publisher dans sa congrégation', async () => {
    const publisher = await withScope(congregationIdA, tx =>
      getPublisherById(tx, publisherIdA as UserId, congregationIdA as CongregationId, serviceYearStart),
    )

    expect(publisher).not.toBeNull()
    expect(publisher?.id).toBe(publisherIdA)
    expect(publisher?.congregationId).toBe(congregationIdA)
  })

  it('retourne null si le publisher appartient à une autre congrégation', async () => {
    const publisher = await withScope(congregationIdB, tx =>
      getPublisherById(tx, publisherIdA as UserId, congregationIdA as CongregationId, serviceYearStart),
    )

    expect(publisher).toBeNull()
  })
})
