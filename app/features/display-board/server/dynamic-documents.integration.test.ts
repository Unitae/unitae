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
let aliceId: number
let aliceAccountIdInner: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Board Dynamic Test ${ts}`, slug: `board-dynamic-${ts}`, active: true },
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
        email: `alice-board-${ts}@test.com`,
        password: 'hashed',
        active: true,
        memberId: aliceMember.id,
        congregationId,
      },
    })
    aliceId = aliceMember.id
    aliceAccountIdInner = aliceAccount.id

    // Create a second member for group responsible/deputy. Pioneer requires
    // baptism per the CHECK constraint.
    const bob = await tx.member.create({
      data: {
        firstname: 'Bob',
        lastname: 'Martin',
        baptismDate: new Date('2010-01-01'),
        isPublisher: true,
        type: PublisherType.PionnierPermanant,
        congregationId,
      },
    })

    // Create publisher groups
    const group = await tx.publisherGroup.create({
      data: { name: `Group A ${ts}`, adress: '1 Rue de la Paix', responsibleId: aliceId, congregationId },
    })

    await tx.publisherGroup.create({
      data: { name: `Group B ${ts}`, adress: '2 Avenue des Champs', responsibleId: bob.id, congregationId },
    })

    // Assign Alice to a group
    await tx.member.update({
      where: { id: aliceId },
      data: { publisherGroupId: group.id },
    })

    // Create programme template and future event
    const template = await tx.programmeTemplate.create({
      data: { name: `Midweek ${ts}`, key: `midweek-${ts}`, congregationId },
    })

    const eventKind = await tx.eventKind.create({
      data: { name: `Midweek ${ts}`, key: `midweek-kind-${ts}`, color: '#00aa00', congregationId },
    })

    await tx.event.create({
      data: {
        name: `Future Meeting ${ts}`,
        kindId: eventKind.id,
        templateId: template.id,
        startDate: new Date('2027-06-01T19:00:00Z'),
        endDate: new Date('2027-06-01T21:00:00Z'),
        createdById: aliceAccountIdInner,
        congregationId,
      },
    })

    // Create a dynamic document settings for publisher-groups
    const section = await tx.boardSection.create({
      data: { name: `Section ${ts}`, order: 0, congregationId },
    })

    await tx.boardDynamicDocumentSettings.create({
      data: {
        title: 'Groupes',
        dynamicType: 'publisher-groups',
        dynamicRef: null,
        sectionId: section.id,
        congregationId,
      },
    })
  })
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.boardDynamicDocumentView.deleteMany({ where: { settings: { congregationId } } })
    await tx.boardDynamicDocumentSettings.deleteMany({ where: { congregationId } })
    await tx.boardSection.deleteMany({ where: { congregationId } })
    await tx.programmePartAssignment.deleteMany({ where: { congregationId } })
    await tx.event.deleteMany({ where: { congregationId } })
    await tx.eventKind.deleteMany({ where: { congregationId } })
    await tx.programmeTemplate.deleteMany({ where: { congregationId } })
    await tx.publisherGroup.deleteMany({ where: { congregationId } })
    await tx.userAccount.deleteMany({ where: { congregationId } })
    await tx.member.deleteMany({ where: { congregationId } })
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

const { getDynamicPreview, getContentVersion, markDynamicDocumentViewed } = await import('./dynamic-documents.server')

// --- getDynamicPreview ---

describe('getDynamicPreview (integration)', () => {
  it('returns group count for publisher-groups', async () => {
    const result = await withScope(congregationId, tx =>
      getDynamicPreview(tx, 'publisher-groups', null, congregationId),
    )

    expect(result).toBe('2 groupes')
  })

  it('returns pioneer count for pioneers', async () => {
    const result = await withScope(congregationId, tx => getDynamicPreview(tx, 'pioneers', null, congregationId))

    expect(result).toBe('1 pionniers')
  })

  it('returns next event date for programme', async () => {
    const result = await withScope(congregationId, tx =>
      getDynamicPreview(tx, 'programme', `midweek-${ts}`, congregationId),
    )

    expect(result).toContain('Prochain')
  })

  it('returns null for programme with no matching template', async () => {
    const result = await withScope(congregationId, tx =>
      getDynamicPreview(tx, 'programme', 'nonexistent-template', congregationId),
    )

    expect(result).toBeNull()
  })
})

// --- getContentVersion ---

describe('getContentVersion (integration)', () => {
  it('returns a date for publisher-groups when groups exist', async () => {
    const result = await withScope(congregationId, tx =>
      getContentVersion(tx, 'publisher-groups', null, congregationId),
    )

    expect(result).toBeInstanceOf(Date)
  })

  it('returns a date for pioneers when pioneers exist', async () => {
    const result = await withScope(congregationId, tx => getContentVersion(tx, 'pioneers', null, congregationId))

    expect(result).toBeInstanceOf(Date)
  })

  it('returns a date for programme with future events', async () => {
    const result = await withScope(congregationId, tx =>
      getContentVersion(tx, 'programme', `midweek-${ts}`, congregationId),
    )

    expect(result).toBeInstanceOf(Date)
  })

  it('returns null for unknown type', async () => {
    const result = await withScope(congregationId, tx => getContentVersion(tx, 'unknown', null, congregationId))

    expect(result).toBeNull()
  })
})

// --- markDynamicDocumentViewed ---

describe('markDynamicDocumentViewed (integration)', () => {
  it('creates a view record and can update it', async () => {
    const settings = await withScope(congregationId, tx =>
      tx.boardDynamicDocumentSettings.findFirst({ where: { congregationId } }),
    )
    expect(settings).not.toBeNull()
    const settingsId = settings?.id ?? 0

    // First view — userId on BoardDynamicDocumentView points at UserAccount.
    await withScope(congregationId, tx => markDynamicDocumentViewed(tx, settingsId, aliceAccountIdInner))

    const view = await withScope(congregationId, tx =>
      tx.boardDynamicDocumentView.findFirst({
        where: { settingsId, userId: aliceAccountIdInner },
      }),
    )
    expect(view).not.toBeNull()
    const firstViewedAt = view?.viewedAt ?? new Date(0)

    // Second view (upsert should update timestamp)
    await new Promise(r => setTimeout(r, 50))
    await withScope(congregationId, tx => markDynamicDocumentViewed(tx, settingsId, aliceAccountIdInner))

    const updatedView = await withScope(congregationId, tx =>
      tx.boardDynamicDocumentView.findFirst({
        where: { settingsId, userId: aliceAccountIdInner },
      }),
    )
    expect(updatedView).not.toBeNull()
    expect(updatedView?.viewedAt.getTime()).toBeGreaterThanOrEqual(firstViewedAt.getTime())
  })
})
