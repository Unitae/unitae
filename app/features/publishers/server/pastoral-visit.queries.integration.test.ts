import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { getPastoralVisitForMember } from './pastoral-visit.queries'

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
let congAId: number
let congBId: number
let visitedId: number
let anonymizedId: number
let otherCongregationId: number

beforeAll(async () => {
  const [congA, congB] = await Promise.all([
    testDb.congregation.create({ data: { name: `Visit A ${ts}`, slug: `visit-a-${ts}`, active: true } }),
    testDb.congregation.create({ data: { name: `Visit B ${ts}`, slug: `visit-b-${ts}`, active: true } }),
  ])
  congAId = congA.id
  congBId = congB.id

  await withScope(congAId, async tx => {
    const visited = await tx.member.create({
      data: {
        firstname: 'Visited',
        lastname: `A ${ts}`,
        isPublisher: true,
        birthDate: new Date('1980-02-03'),
        lastPastoralVisitAt: new Date('2026-10-20T00:00:00Z'),
        congregationId: congAId,
      },
    })
    visitedId = visited.id
    const anonymized = await tx.member.create({
      data: {
        firstname: 'Utilisateur',
        lastname: 'supprimé',
        isPublisher: true,
        anonymizedAt: new Date('2026-06-01T03:00:00Z'),
        congregationId: congAId,
      },
    })
    anonymizedId = anonymized.id
  })

  await withScope(congBId, async tx => {
    const other = await tx.member.create({
      data: { firstname: 'Other', lastname: `B ${ts}`, isPublisher: true, congregationId: congBId },
    })
    otherCongregationId = other.id
  })
})

afterAll(async () => {
  await testDb.member.deleteMany({ where: { congregationId: { in: [congAId, congBId] } } })
  await testDb.congregation.deleteMany({ where: { id: { in: [congAId, congBId] } } })
  await testDb.$disconnect()
})

describe('getPastoralVisitForMember (integration)', () => {
  it("reads the member's name, group and last visit, and nothing else about them", async () => {
    const member = await withScope(congAId, tx => getPastoralVisitForMember(tx, visitedId, congAId))

    expect(member?.lastPastoralVisitAt?.toISOString().slice(0, 10)).toBe('2026-10-20')
    expect(Object.keys(member ?? {}).sort()).toEqual([
      'firstname',
      'id',
      'lastPastoralVisitAt',
      'lastname',
      'publisherGroupId',
    ])
  })

  it('finds no member of another congregation', async () => {
    const member = await withScope(congAId, tx => getPastoralVisitForMember(tx, otherCongregationId, congAId))
    expect(member).toBeNull()
  })

  // Anonymization is final: a date written afterwards would never be scrubbed.
  it('finds no anonymized member', async () => {
    const member = await withScope(congAId, tx => getPastoralVisitForMember(tx, anonymizedId, congAId))
    expect(member).toBeNull()
  })
})
