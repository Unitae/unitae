import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { getGroup, getGroups } from './groups.server'

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
let groupAId: number
let groupBId: number

beforeAll(async () => {
  const [congA, congB] = await Promise.all([
    testDb.congregation.create({ data: { name: `Groups A ${ts}`, slug: `groups-a-${ts}`, active: true } }),
    testDb.congregation.create({ data: { name: `Groups B ${ts}`, slug: `groups-b-${ts}`, active: true } }),
  ])
  congAId = congA.id
  congBId = congB.id

  await withScope(congAId, async tx => {
    const responsible = await tx.member.create({
      data: { firstname: 'Resp', lastname: `A ${ts}`, isPublisher: true, congregationId: congAId },
    })
    const g = await tx.publisherGroup.create({
      data: { name: 'A-Group', adress: '', responsibleId: responsible.id, congregationId: congAId },
    })
    groupAId = g.id
  })

  await withScope(congBId, async tx => {
    const responsible = await tx.member.create({
      data: { firstname: 'Resp', lastname: `B ${ts}`, isPublisher: true, congregationId: congBId },
    })
    const g = await tx.publisherGroup.create({
      data: { name: 'B-Group', adress: '', responsibleId: responsible.id, congregationId: congBId },
    })
    groupBId = g.id
  })
})

afterAll(async () => {
  await testDb.publisherGroup.deleteMany({ where: { congregationId: { in: [congAId, congBId] } } })
  await testDb.member.deleteMany({ where: { congregationId: { in: [congAId, congBId] } } })
  await testDb.congregation.deleteMany({ where: { id: { in: [congAId, congBId] } } })
  await testDb.$disconnect()
})

describe('getGroups (integration)', () => {
  it('returns only the current congregation groups under RLS scoping', async () => {
    const [aGroups, bGroups] = await Promise.all([
      withScope(congAId, tx => getGroups(tx, congAId)),
      withScope(congBId, tx => getGroups(tx, congBId)),
    ])

    expect(aGroups.map(g => g.id)).toEqual([groupAId])
    expect(bGroups.map(g => g.id)).toEqual([groupBId])
  })

  it('returns nothing when the congregationId filter targets another tenant, even inside its own scope', async () => {
    const rows = await withScope(congAId, tx => getGroups(tx, congBId))
    expect(rows).toEqual([])
  })
})

describe('getGroup (integration)', () => {
  it('returns the group when queried inside its congregation scope', async () => {
    const group = await withScope(congAId, tx => getGroup(tx, groupAId, congAId))
    expect(group?.id).toBe(groupAId)
    expect(group?.name).toBe('A-Group')
  })

  it('returns null when the group belongs to another congregation (RLS hides it)', async () => {
    const group = await withScope(congAId, tx => getGroup(tx, groupBId, congBId))
    expect(group).toBeNull()
  })
})
