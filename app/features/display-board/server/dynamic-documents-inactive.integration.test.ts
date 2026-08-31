import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'

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
let activePublisherId: number
let inactivePublisherId: number
let activePioneerId: number
let inactivePioneerId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Inactive Filter ${ts}`, slug: `inactive-filter-${ts}`, active: true },
  })
  congregationId = cong.id

  await withScope(congregationId, async tx => {
    const active = await tx.member.create({
      data: { firstname: 'Active', lastname: 'Publisher', isPublisher: true, congregationId },
    })
    activePublisherId = active.id

    const inactive = await tx.member.create({
      data: {
        firstname: 'Inactive',
        lastname: 'Publisher',
        isPublisher: true,
        inactiveAt: new Date('2026-01-01'),
        congregationId,
      },
    })
    inactivePublisherId = inactive.id

    const activePioneer = await tx.member.create({
      data: {
        firstname: 'Active',
        lastname: 'Pioneer',
        isPublisher: true,
        baptismDate: new Date('2010-01-01'),
        congregationId,
      },
    })
    activePioneerId = activePioneer.id

    const inactivePioneer = await tx.member.create({
      data: {
        firstname: 'Inactive',
        lastname: 'Pioneer',
        isPublisher: true,
        baptismDate: new Date('2010-01-01'),
        inactiveAt: new Date('2026-01-01'),
        congregationId,
      },
    })
    inactivePioneerId = inactivePioneer.id

    // The roster is enrolment-driven: only members with a stint covering the current month appear.
    // Give both pioneers an ongoing (open-ended) permanent stint started in the past so they cover
    // now; the inactive one is still filtered out by its Member.inactiveAt.
    for (const memberId of [activePioneerId, inactivePioneerId]) {
      await tx.pioneerEnrolment.create({
        data: {
          memberId,
          type: PublisherType.PionnierPermanant,
          startMonth: 0,
          startYear: 2020,
          congregationId,
        },
      })
    }

    const group = await tx.publisherGroup.create({
      data: { name: `Group ${ts}`, adress: '1 Rue', responsibleId: activePublisherId, congregationId },
    })

    await tx.member.update({
      where: { id: activePublisherId },
      data: { publisherGroupId: group.id },
    })
    await tx.member.update({
      where: { id: inactivePublisherId },
      data: { publisherGroupId: group.id },
    })
  })
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.publisherGroup.deleteMany({ where: { congregationId } })
    await tx.member.deleteMany({ where: { congregationId } })
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

const { getDynamicDocumentData } = await import('./dynamic-documents.server')

describe('getDynamicDocumentData publisher-groups (integration)', () => {
  it('excludes inactive members from the rendered group roster', async () => {
    const result = await withScope(congregationId, tx =>
      getDynamicDocumentData(tx, 'publisher-groups', null, congregationId),
    )

    expect(result?.type).toBe('publisher-groups')
    if (result?.type !== 'publisher-groups') throw new Error('expected publisher-groups payload')

    const [group] = result.groups
    expect(group).toBeDefined()
    const memberIds = group.members.map(m => m.id)
    expect(memberIds).toContain(activePublisherId)
    expect(memberIds).not.toContain(inactivePublisherId)
  })
})

describe('getDynamicDocumentData pioneers (integration)', () => {
  it('excludes inactive pioneers from the rendered roster', async () => {
    const result = await withScope(congregationId, tx => getDynamicDocumentData(tx, 'pioneers', null, congregationId))

    expect(result?.type).toBe('pioneers')
    if (result?.type !== 'pioneers') throw new Error('expected pioneers payload')

    const pioneerIds = result.pioneers.map(p => p.id)
    expect(pioneerIds).toContain(activePioneerId)
    expect(pioneerIds).not.toContain(inactivePioneerId)
  })
})
