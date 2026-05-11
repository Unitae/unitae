import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EventKind } from '~/features/events/model/event-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
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
let aliceId: number
let aliceAccountId: number
let bobId: number
let bobAccountId: number
let pastEventId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Dashboard Test ${ts}`, slug: `dashboard-test-${ts}`, active: true },
  })
  congregationId = cong.id

  await withScope(congregationId, async tx => {
    const aliceMember = await tx.member.create({
      data: {
        firstname: 'Alice',
        lastname: 'Dupont',
        isPublisher: true,
        congregationId,
      },
    })
    const aliceAccount = await tx.userAccount.create({
      data: {
        email: `alice-dash-${ts}@test.com`,
        password: 'hashed',
        active: true,
        memberId: aliceMember.id,
        congregationId,
      },
    })
    aliceId = aliceMember.id
    aliceAccountId = aliceAccount.id

    const bobMember = await tx.member.create({
      data: {
        firstname: 'Bob',
        lastname: 'Martin',
        isPublisher: true,
        congregationId,
      },
    })
    const bobAccount = await tx.userAccount.create({
      data: {
        email: `bob-dash-${ts}@test.com`,
        password: 'hashed',
        active: true,
        memberId: bobMember.id,
        congregationId,
      },
    })
    bobId = bobMember.id
    bobAccountId = bobAccount.id

    // Territory with attribution to Alice
    const territory = await tx.territory.create({
      data: { number: `T-DASH-${ts}`, type: TerritoryKind.Classical, congregationId },
    })

    await tx.attribution.create({
      data: {
        publisherId: aliceId,
        territoryId: territory.id,
        startDate: new Date('2026-01-01'),
        lateDate: new Date('2026-03-01'), // overdue
        congregationId,
      },
    })

    await tx.attribution.create({
      data: {
        publisherId: aliceId,
        territoryId: territory.id,
        startDate: new Date('2026-01-01'),
        lateDate: new Date('2026-03-01'),
        endDate: new Date('2026-02-15'), // completed, should not appear
        congregationId,
      },
    })

    // Board documents
    const section = await tx.boardSection.create({
      data: { name: `Section ${ts}`, order: 0, congregationId },
    })

    await tx.boardDocument.create({
      data: {
        title: `Unread PDF ${ts}`,
        sectionId: section.id,
        visibleFrom: new Date('2026-01-01'),
        visibleUntil: null,
        congregationId,
      },
    })

    const readDoc = await tx.boardDocument.create({
      data: {
        title: `Read PDF ${ts}`,
        sectionId: section.id,
        visibleFrom: new Date('2026-01-01'),
        visibleUntil: null,
        congregationId,
      },
    })

    // Mark doc as read by Alice
    await tx.boardDocument.update({
      where: {
        id_congregationId: { id: readDoc.id, congregationId },
      },
      data: { viewedBy: { connect: { id: aliceAccountId } } },
    })

    // Future event with programme assignments
    const eventKind = await tx.eventKind.create({
      data: { name: 'Midweek', key: `midweek-${ts}`, color: '#00aa00', congregationId },
    })

    const futureEvent = await tx.event.create({
      data: {
        name: `Future Meeting ${ts}`,
        kindId: eventKind.id,
        startDate: new Date('2027-06-01T19:00:00Z'),
        endDate: new Date('2027-06-01T21:00:00Z'),
        createdById: aliceAccountId,
        congregationId,
      },
    })

    await tx.programmePartAssignment.create({
      data: {
        eventId: futureEvent.id,
        assigneeId: aliceId,
        assistantId: bobId,
        name: 'Talk',
        section: 'main',
        order: 1,
        topic: 'Love',
        congregationId,
      },
    })

    await tx.programmePartAssignment.create({
      data: {
        eventId: futureEvent.id,
        assigneeId: bobId,
        name: 'Reading',
        section: 'main',
        order: 2,
        congregationId,
      },
    })

    await tx.programmeServiceRoleAssignment.create({
      data: {
        eventId: futureEvent.id,
        assigneeId: bobId,
        name: 'Sound',
        congregationId,
      },
    })

    // Past event (should not appear in getNextMeeting)
    const past = await tx.event.create({
      data: {
        name: `Past Meeting ${ts}`,
        startDate: new Date('2025-01-01T19:00:00Z'),
        endDate: new Date('2025-01-01T21:00:00Z'),
        createdById: aliceAccountId,
        congregationId,
      },
    })
    pastEventId = past.id
  })
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.programmeServiceRoleAssignment.deleteMany({ where: { congregationId } })
    await tx.programmePartAssignment.deleteMany({ where: { congregationId } })
    await tx.event.deleteMany({ where: { congregationId } })
    await tx.eventKind.deleteMany({ where: { congregationId } })
    await tx.boardDocument.deleteMany({ where: { congregationId } })
    await tx.boardSection.deleteMany({ where: { congregationId } })
    await tx.attribution.deleteMany({ where: { congregationId } })
    await tx.territory.deleteMany({ where: { congregationId } })
    await tx.userAccount.deleteMany({ where: { congregationId } })
    await tx.member.deleteMany({ where: { congregationId } })
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

// --- Import the module under test ---

const { getUserTerritories, getRecentDocuments, getUnreadDocumentCount, getNextMeeting } = await import(
  './dashboard.server'
)

// --- Tests ---

describe('getUserTerritories (integration)', () => {
  it('returns only active attributions for the user', async () => {
    const result = await withScope(congregationId, tx => getUserTerritories(tx, aliceId))
    // Only the attribution without endDate should appear
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('overdue')
  })

  it('returns empty array for user with no attributions', async () => {
    const result = await withScope(congregationId, tx => getUserTerritories(tx, bobId))
    expect(result).toEqual([])
  })
})

describe('getUnreadDocumentCount (integration)', () => {
  it('counts only unread visible documents for the user', async () => {
    const result = await withScope(congregationId, tx => getUnreadDocumentCount(tx, aliceAccountId, congregationId))
    // 1 unread PDF (the other was marked as read)
    expect(result).toBe(1)
  })

  it('counts all documents as unread for a user who read nothing', async () => {
    const result = await withScope(congregationId, tx => getUnreadDocumentCount(tx, bobAccountId, congregationId))
    // Bob has read nothing — both PDFs are unread
    expect(result).toBe(2)
  })
})

describe('getRecentDocuments (integration)', () => {
  it('returns documents with correct alreadyViewed flag', async () => {
    const result = await withScope(congregationId, tx => getRecentDocuments(tx, aliceAccountId, congregationId))
    expect(result.length).toBeGreaterThanOrEqual(1)
    const readDoc = result.find(d => d.title.includes('Read PDF'))
    const unreadDoc = result.find(d => d.title.includes('Unread PDF'))
    expect(readDoc?.alreadyViewed).toBe(true)
    expect(unreadDoc?.alreadyViewed).toBe(false)
  })
})

describe('getNextMeeting (integration)', () => {
  it('returns the next future event with programme data', async () => {
    const result = await withScope(congregationId, tx => getNextMeeting(tx, aliceId))
    expect(result).not.toBeNull()
    expect(result?.name).toContain('Future Meeting')
    expect(result?.partAssignments.length).toBeGreaterThanOrEqual(2)
    expect(result?.serviceRoleAssignments.length).toBeGreaterThanOrEqual(1)
  })

  it('identifies parts assigned to the user (as assignee)', async () => {
    const result = await withScope(congregationId, tx => getNextMeeting(tx, aliceId))
    expect(result?.userPartIds).toHaveLength(1)
    const userPart = result?.partAssignments.find(p => result.userPartIds.includes(p.id))
    expect(userPart?.name).toBe('Talk')
  })

  it('identifies parts assigned to the user (as assistant)', async () => {
    const result = await withScope(congregationId, tx => getNextMeeting(tx, bobId))
    // Bob is assistant on Talk and assignee on Reading
    expect(result?.userPartIds).toHaveLength(2)
    expect(result?.userServiceRoleIds).toHaveLength(1)
  })

  it('does not return past events', async () => {
    const result = await withScope(congregationId, tx => getNextMeeting(tx, aliceId))
    expect(result?.id).not.toBe(pastEventId)
  })

  it("ignores another user's day off when picking the next meeting", async () => {
    const offEventId = await withScope(congregationId, async tx => {
      const offKind = await tx.eventKind.create({
        data: { name: 'Absence', key: EventKind.Off, color: '#888888', congregationId },
      })
      const off = await tx.event.create({
        data: {
          name: 'Absence',
          kindId: offKind.id,
          startDate: new Date('2027-05-01T00:00:00Z'),
          endDate: new Date('2027-05-03T00:00:00Z'),
          createdById: bobAccountId,
          congregationId,
        },
      })
      return off.id
    })

    try {
      const result = await withScope(congregationId, tx => getNextMeeting(tx, aliceId))
      expect(result?.name).toBe(`Future Meeting ${ts}`)
    } finally {
      await withScope(congregationId, async tx => {
        await tx.event.delete({ where: { id_congregationId: { id: offEventId, congregationId } } })
        await tx.eventKind.deleteMany({ where: { key: EventKind.Off, congregationId } })
      })
    }
  })
})
