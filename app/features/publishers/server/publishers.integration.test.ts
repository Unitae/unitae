import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { CongregationId, MemberId } from '~/shared/types/branded'
import { createTestCongregation, createTestUser } from '~/tests/factories'
import { getPublisherById, getPublishersWithGroup } from './publishers.server'

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
  publisherIdA = userA.memberId ?? userA.id
  await createTestUser(testDb, congregationIdB, { isPublisher: true })
})

afterAll(async () => {
  await testDb.userAccount.deleteMany({ where: { congregationId: { in: [congregationIdA, congregationIdB] } } })
  await testDb.member.deleteMany({ where: { congregationId: { in: [congregationIdA, congregationIdB] } } })
  await testDb.congregation.deleteMany({ where: { id: { in: [congregationIdA, congregationIdB] } } })
  await testDb.$disconnect()
})

describe('getPublisherById', () => {
  it('retourne le publisher dans sa congrégation', async () => {
    const publisher = await withScope(congregationIdA, tx =>
      getPublisherById(tx, publisherIdA as MemberId, congregationIdA as CongregationId, serviceYearStart),
    )

    expect(publisher).not.toBeNull()
    expect(publisher?.id).toBe(publisherIdA)
    expect(publisher?.congregationId).toBe(congregationIdA)
  })

  it('retourne null si le publisher appartient à une autre congrégation', async () => {
    const publisher = await withScope(congregationIdB, tx =>
      getPublisherById(tx, publisherIdA as MemberId, congregationIdA as CongregationId, serviceYearStart),
    )

    expect(publisher).toBeNull()
  })
})

describe('getPublishersWithGroup search filter', () => {
  let searchCongregationId: number
  const searchSuffix = Date.now()
  const expectedFirstname = `SearchableFirst-${searchSuffix}`
  const expectedLastname = `SearchableLast-${searchSuffix}`
  const otherFirstname = `OtherFirst-${searchSuffix}`
  const otherLastname = `OtherLast-${searchSuffix}`

  beforeAll(async () => {
    const cong = await createTestCongregation(testDb)
    searchCongregationId = cong.id

    await createTestUser(testDb, searchCongregationId, {
      firstname: expectedFirstname,
      lastname: expectedLastname,
    })
    await createTestUser(testDb, searchCongregationId, {
      firstname: otherFirstname,
      lastname: otherLastname,
    })
  })

  afterAll(async () => {
    await testDb.userAccount.deleteMany({ where: { congregationId: searchCongregationId } })
    await testDb.member.deleteMany({ where: { congregationId: searchCongregationId } })
    await testDb.congregation.deleteMany({ where: { id: searchCongregationId } })
  })

  it('returns only publishers whose firstname matches', async () => {
    const result = await withScope(searchCongregationId, tx =>
      getPublishersWithGroup(tx, searchCongregationId, { search: expectedFirstname }),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.firstname).toBe(expectedFirstname)
  })

  it('returns only publishers whose lastname matches', async () => {
    const result = await withScope(searchCongregationId, tx =>
      getPublishersWithGroup(tx, searchCongregationId, { search: expectedLastname }),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.lastname).toBe(expectedLastname)
  })

  it('matches case-insensitively', async () => {
    const result = await withScope(searchCongregationId, tx =>
      getPublishersWithGroup(tx, searchCongregationId, { search: expectedLastname.toLowerCase() }),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.lastname).toBe(expectedLastname)
  })

  it('returns an empty array when no publisher matches (bug #133)', async () => {
    const result = await withScope(searchCongregationId, tx =>
      getPublishersWithGroup(tx, searchCongregationId, { search: `zzz-no-match-${searchSuffix}` }),
    )

    expect(result).toEqual([])
  })

  it('returns all publishers when search is absent', async () => {
    const result = await withScope(searchCongregationId, tx => getPublishersWithGroup(tx, searchCongregationId))

    expect(result).toHaveLength(2)
  })
})
