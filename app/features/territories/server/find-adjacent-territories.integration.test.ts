import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

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
let primaryCongId: number
let otherCongId: number
let t01Id: number
let t02Id: number
let t03Id: number
let crossCongT02Id: number

const { findAdjacentTerritories } = await import('./attributions.server')

beforeAll(async () => {
  const primary = await testDb.congregation.create({
    data: { name: `Adj Primary ${ts}`, slug: `adj-primary-${ts}`, active: true },
  })
  primaryCongId = primary.id

  const other = await testDb.congregation.create({
    data: { name: `Adj Other ${ts}`, slug: `adj-other-${ts}`, active: true },
  })
  otherCongId = other.id

  await withScope(primaryCongId, async tx => {
    const t01 = await tx.territory.create({
      data: { number: 'T01', type: TerritoryKindKey.Classical, congregationId: primaryCongId },
    })
    t01Id = t01.id
    const t02 = await tx.territory.create({
      data: { number: 'T02', type: TerritoryKindKey.Classical, congregationId: primaryCongId },
    })
    t02Id = t02.id
    const t03 = await tx.territory.create({
      data: { number: 'T03', type: TerritoryKindKey.Classical, congregationId: primaryCongId },
    })
    t03Id = t03.id

    // Different type — must be excluded by the type filter even though the number "P01"
    // sorts before "T01" lexicographically.
    await tx.territory.create({
      data: { number: 'P01', type: TerritoryKindKey.Phone, congregationId: primaryCongId },
    })
  })

  // Cross-congregation territory of the same number+type — must be excluded by tenant isolation.
  await withScope(otherCongId, async tx => {
    const crossT02 = await tx.territory.create({
      data: { number: 'T02', type: TerritoryKindKey.Classical, congregationId: otherCongId },
    })
    crossCongT02Id = crossT02.id
  })
})

afterAll(async () => {
  for (const cid of [primaryCongId, otherCongId]) {
    if (!cid) continue
    await withScope(cid, async tx => {
      await tx.territory.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('findAdjacentTerritories (integration)', () => {
  it('returns prev=T01 and next=T03 for the middle territory T02', async () => {
    const result = await withScope(primaryCongId, tx =>
      findAdjacentTerritories(tx, 'T02', TerritoryKindKey.Classical, primaryCongId),
    )
    expect(result.prev).toEqual({ id: t01Id, number: 'T01' })
    expect(result.next).toEqual({ id: t03Id, number: 'T03' })
  })

  it('returns prev=null and next=T02 for the first territory T01', async () => {
    const result = await withScope(primaryCongId, tx =>
      findAdjacentTerritories(tx, 'T01', TerritoryKindKey.Classical, primaryCongId),
    )
    expect(result.prev).toBeNull()
    expect(result.next).toEqual({ id: t02Id, number: 'T02' })
  })

  it('returns prev=T02 and next=null for the last territory T03', async () => {
    const result = await withScope(primaryCongId, tx =>
      findAdjacentTerritories(tx, 'T03', TerritoryKindKey.Classical, primaryCongId),
    )
    expect(result.prev).toEqual({ id: t02Id, number: 'T02' })
    expect(result.next).toBeNull()
  })

  it('does not cross territory types (P01 has no Classical neighbours)', async () => {
    const result = await withScope(primaryCongId, tx =>
      findAdjacentTerritories(tx, 'P01', TerritoryKindKey.Phone, primaryCongId),
    )
    expect(result.prev).toBeNull()
    expect(result.next).toBeNull()
  })

  it('does not leak across congregations (other-cong T02 is invisible)', async () => {
    const result = await withScope(primaryCongId, tx =>
      findAdjacentTerritories(tx, 'T02', TerritoryKindKey.Classical, primaryCongId),
    )
    // Sanity: result.prev/next must reference primary's T01/T03, not the cross-cong T02.
    expect(result.prev?.id).not.toBe(crossCongT02Id)
    expect(result.next?.id).not.toBe(crossCongT02Id)
  })
})
