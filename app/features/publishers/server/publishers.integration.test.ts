import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { PublisherListFilters } from '~/features/publishers/model/publisher-list-filters'
import type { CongregationId, MemberId } from '~/shared/types/branded'
import { PublisherType } from '~/shared/types/publisher-type'
import { createTestCongregation, createTestUser } from '~/tests/factories'
import { listPublishers } from './list-publishers.server'
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

const ACTIVE: PublisherListFilters = {
  search: '',
  groupIds: [],
  noGroup: false,
  privilege: null,
  status: 'active',
  sort: 'name',
}

describe('listPublishers search filter', () => {
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
      listPublishers(tx, searchCongregationId, { ...ACTIVE, search: expectedFirstname }, { includeAbsences: false }),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.firstname).toBe(expectedFirstname)
  })

  it('returns only publishers whose lastname matches', async () => {
    const result = await withScope(searchCongregationId, tx =>
      listPublishers(tx, searchCongregationId, { ...ACTIVE, search: expectedLastname }, { includeAbsences: false }),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.lastname).toBe(expectedLastname)
  })

  it('matches case-insensitively', async () => {
    const result = await withScope(searchCongregationId, tx =>
      listPublishers(
        tx,
        searchCongregationId,
        { ...ACTIVE, search: expectedLastname.toLowerCase() },
        { includeAbsences: false },
      ),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.lastname).toBe(expectedLastname)
  })

  it('returns an empty array when no publisher matches (bug #133)', async () => {
    const result = await withScope(searchCongregationId, tx =>
      listPublishers(
        tx,
        searchCongregationId,
        { ...ACTIVE, search: `zzz-no-match-${searchSuffix}` },
        { includeAbsences: false },
      ),
    )

    expect(result).toEqual([])
  })

  it('returns all publishers when search is absent', async () => {
    const result = await withScope(searchCongregationId, tx =>
      listPublishers(tx, searchCongregationId, ACTIVE, { includeAbsences: false }),
    )

    expect(result).toHaveLength(2)
  })
})

// The pioneer filter is a condition over PioneerEnrolment stints. The unit
// test asserts the `where` SHAPE, which cannot tell whether Prisma builds SQL that actually selects
// the right people — and this branch already produced three column reads that typechecked and failed
// only at runtime. So exercise it against the database.
describe('listPublishers — filtering by pioneer privilege (integration)', () => {
  const ts = Date.now()
  let congId: number
  let permanentId: number
  let monthlyAuxId: number
  let plainId: number

  beforeAll(async () => {
    const cong = await createTestCongregation(testDb, { name: `TypeFilter ${ts}`, slug: `type-filter-${ts}` })
    congId = cong.id

    const permanent = await createTestUser(testDb, congId, { isPublisher: true, firstname: `Perm${ts}` })
    permanentId = permanent.memberId ?? permanent.id
    const monthly = await createTestUser(testDb, congId, { isPublisher: true, firstname: `Month${ts}` })
    monthlyAuxId = monthly.memberId ?? monthly.id
    const plain = await createTestUser(testDb, congId, { isPublisher: true, firstname: `Plain${ts}` })
    plainId = plain.memberId ?? plain.id

    await testDb.pioneerEnrolment.createMany({
      data: [
        // Ongoing permanent pioneer.
        {
          memberId: permanentId,
          congregationId: congId,
          type: PublisherType.PionnierPermanant,
          startMonth: 8,
          startYear: 2025,
        },
        // Single-month auxiliary: closed, so this member is NOT a standing auxiliary.
        {
          memberId: monthlyAuxId,
          congregationId: congId,
          type: PublisherType.PionnierAuxiliaires,
          startMonth: 4,
          startYear: 2026,
          endMonth: 4,
          endYear: 2026,
        },
      ],
    })
  })

  afterAll(async () => {
    await testDb.pioneerEnrolment.deleteMany({ where: { congregationId: congId } })
    await testDb.userAccount.deleteMany({ where: { congregationId: congId } })
    await testDb.member.deleteMany({ where: { congregationId: congId } })
    await testDb.congregation.deleteMany({ where: { id: congId } })
  })

  it('returns only the member with an ongoing stint of that type', async () => {
    const result = await withScope(congId, tx =>
      listPublishers(tx, congId, { ...ACTIVE, privilege: 'regular-pioneer' }, { includeAbsences: false }),
    )
    expect(result.map(r => r.id)).toEqual([permanentId])
  })

  it('returns nobody for a type nobody currently holds', async () => {
    const result = await withScope(congId, tx =>
      listPublishers(tx, congId, { ...ACTIVE, privilege: 'missionary' }, { includeAbsences: false }),
    )
    expect(result).toEqual([])
  })

  // A single-month auxiliary is closed, so its holder is not a standing auxiliary pioneer.
  it('does not count a closed single-month auxiliary as an auxiliary pioneer', async () => {
    const result = await withScope(congId, tx =>
      listPublishers(tx, congId, { ...ACTIVE, privilege: 'auxiliary-pioneer' }, { includeAbsences: false }),
    )
    expect(result).toEqual([])
  })

  it('tags each publisher with their ongoing pioneer service only', async () => {
    const result = await withScope(congId, tx => listPublishers(tx, congId, ACTIVE, { includeAbsences: false }))
    const privileges = Object.fromEntries(result.map(r => [r.id, r.privileges]))
    expect(privileges).toEqual({ [permanentId]: ['regular-pioneer'], [monthlyAuxId]: [], [plainId]: [] })
  })
})
