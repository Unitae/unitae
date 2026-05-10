import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'

// File operations are not the focus of these tests — isolate from storage layer
vi.mock('./document.server', () => ({
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: {},
  audit: vi.fn(),
}))

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
let primarySectionId: number
let otherSectionId: number
let firstDocId: number
let secondDocId: number
let otherDocId: number
let dynamicDocId: number

const { bulkDeleteBoardItems, bulkMoveBoardItems, createBoardDocument, isDocumentOwnedByUploader, reorderBoardItems } =
  await import('./board-document.server')

beforeAll(async () => {
  const primaryCong = await testDb.congregation.create({
    data: { name: `Board Doc Primary ${ts}`, slug: `board-doc-primary-${ts}`, active: true },
  })
  primaryCongId = primaryCong.id

  const otherCong = await testDb.congregation.create({
    data: { name: `Board Doc Other ${ts}`, slug: `board-doc-other-${ts}`, active: true },
  })
  otherCongId = otherCong.id

  await withScope(primaryCongId, async tx => {
    const user = await tx.userAccount.create({
      data: {
        email: `board-doc-primary-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Alice',
        lastname: 'Primary',
        active: true,
        isPublisher: true,
        type: PublisherType.Normal,
        congregationId: primaryCongId,
      },
    })

    const section1 = await tx.boardSection.create({
      data: { name: `Primary Section 1 ${ts}`, order: 0, congregationId: primaryCongId },
    })
    primarySectionId = section1.id

    const section2 = await tx.boardSection.create({
      data: { name: `Primary Section 2 ${ts}`, order: 5, congregationId: primaryCongId },
    })

    const doc1 = await tx.boardDocument.create({
      data: {
        title: 'Primary Doc 1',
        type: 'pdf',
        sectionId: primarySectionId,
        order: 0,
        congregationId: primaryCongId,
      },
    })
    firstDocId = doc1.id

    const doc2 = await tx.boardDocument.create({
      data: {
        title: 'Primary Doc 2',
        type: 'pdf',
        sectionId: primarySectionId,
        order: 5,
        congregationId: primaryCongId,
      },
    })
    secondDocId = doc2.id

    const dynDoc = await tx.boardDynamicDocumentSettings.create({
      data: {
        title: 'Primary Dyn Doc',
        dynamicType: 'publisher-groups',
        dynamicRef: null,
        sectionId: section2.id,
        congregationId: primaryCongId,
      },
    })
    dynamicDocId = dynDoc.id

    await tx.userAccount.delete({ where: { id: user.id } })
  })

  await withScope(otherCongId, async tx => {
    const otherSection = await tx.boardSection.create({
      data: { name: `Other Section ${ts}`, order: 0, congregationId: otherCongId },
    })
    otherSectionId = otherSection.id

    const otherDoc = await tx.boardDocument.create({
      data: { title: 'Other Doc', type: 'pdf', sectionId: otherSectionId, order: 0, congregationId: otherCongId },
    })
    otherDocId = otherDoc.id
  })
})

afterAll(async () => {
  for (const congId of [primaryCongId, otherCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.boardDynamicDocumentSettings.deleteMany({})
      await tx.boardDocumentVersion.deleteMany({})
      await tx.boardDocument.deleteMany({})
      await tx.boardSection.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('bulkDeleteBoardItems (integration)', () => {
  it('deletes only documents belonging to the scoped congregation', async () => {
    const { pdfDeleted } = await withScope(primaryCongId, tx =>
      bulkDeleteBoardItems(tx, primaryCongId, [firstDocId], []),
    )

    expect(pdfDeleted).toBe(1)

    // Other congregation's document must still exist
    const surviving = await withScope(otherCongId, tx => tx.boardDocument.findUnique({ where: { id: otherDocId } }))
    expect(surviving).not.toBeNull()
  })

  it('returns 0 when given IDs that belong to a different congregation', async () => {
    const { pdfDeleted } = await withScope(primaryCongId, tx =>
      bulkDeleteBoardItems(tx, primaryCongId, [otherDocId], []),
    )

    expect(pdfDeleted).toBe(0)

    // Other congregation's document must be untouched
    const surviving = await withScope(otherCongId, tx => tx.boardDocument.findUnique({ where: { id: otherDocId } }))
    expect(surviving).not.toBeNull()
  })

  it('deletes dynamic documents scoped to the congregation', async () => {
    const { dynDeleted } = await withScope(primaryCongId, tx =>
      bulkDeleteBoardItems(tx, primaryCongId, [], [dynamicDocId]),
    )

    expect(dynDeleted).toBe(1)
  })
})

describe('bulkMoveBoardItems (integration)', () => {
  it('moves only documents belonging to the scoped congregation', async () => {
    const sections = await withScope(primaryCongId, tx =>
      tx.boardSection.findMany({ where: { congregationId: primaryCongId } }),
    )
    const targetSection = sections.find(s => s.id !== primarySectionId) ?? sections[0]

    const { pdfMoved } = await withScope(primaryCongId, tx =>
      bulkMoveBoardItems(tx, primaryCongId, targetSection.id, [secondDocId], []),
    )

    expect(pdfMoved).toBe(1)
  })

  it('returns 0 when given IDs that belong to a different congregation', async () => {
    const { pdfMoved } = await withScope(primaryCongId, tx =>
      bulkMoveBoardItems(tx, primaryCongId, primarySectionId, [otherDocId], []),
    )

    expect(pdfMoved).toBe(0)

    // Other congregation's document section must be unchanged
    const otherDoc = await withScope(otherCongId, tx => tx.boardDocument.findUnique({ where: { id: otherDocId } }))
    expect(otherDoc?.sectionId).toBe(otherSectionId)
  })
})

describe('reorderBoardItems (integration)', () => {
  it('updates order only for items in the scoped congregation', async () => {
    const otherDocBefore = await withScope(otherCongId, tx =>
      tx.boardDocument.findUnique({ where: { id: otherDocId } }),
    )

    // Reorder primary congregation items — other congregation must be unaffected
    await withScope(primaryCongId, tx => reorderBoardItems(tx, primaryCongId, [{ kind: 'pdf', id: secondDocId }]))

    const otherDocAfter = await withScope(otherCongId, tx => tx.boardDocument.findUnique({ where: { id: otherDocId } }))
    expect(otherDocAfter?.order).toBe(otherDocBefore?.order)
  })
})

describe('createBoardDocument (integration)', () => {
  it('writes a v1 BoardDocumentVersion attributing the creator', async () => {
    const uploaderId = await withScope(primaryCongId, async tx => {
      const user = await tx.userAccount.create({
        data: {
          email: `board-doc-uploader-${ts}@test.com`,
          password: 'hashed',
          firstname: 'Carla',
          lastname: 'Uploader',
          active: true,
          isPublisher: true,
          type: PublisherType.Normal,
          congregationId: primaryCongId,
        },
      })
      return user.id
    })

    const created = await withScope(primaryCongId, tx =>
      createBoardDocument(tx, {
        title: `v1 Anchor Doc ${ts}`,
        sectionId: primarySectionId,
        uri: 'storage/key.pdf',
        congregationId: primaryCongId,
        actorId: uploaderId,
      }),
    )

    const v1 = await withScope(primaryCongId, tx =>
      tx.boardDocumentVersion.findFirst({
        where: { documentId: created.id, versionNumber: 1 },
        select: { uploadedById: true, uri: true },
      }),
    )

    expect(v1).not.toBeNull()
    expect(v1?.uploadedById).toBe(uploaderId)
    expect(v1?.uri).toBe('storage/key.pdf')

    // Cleanup the user we created — versions cascade with the document.
    await testDb.userAccount.delete({ where: { id: uploaderId } })
  })
})

describe('isDocumentOwnedByUploader (integration)', () => {
  it('returns true when v1 was uploaded by the user', async () => {
    const ownerId = await withScope(primaryCongId, async tx => {
      const user = await tx.userAccount.create({
        data: {
          email: `board-doc-owner-${ts}@test.com`,
          password: 'hashed',
          firstname: 'Owen',
          lastname: 'Owner',
          active: true,
          isPublisher: true,
          type: PublisherType.Normal,
          congregationId: primaryCongId,
        },
      })
      return user.id
    })

    const created = await withScope(primaryCongId, tx =>
      createBoardDocument(tx, {
        title: `Owned Doc ${ts}`,
        sectionId: primarySectionId,
        uri: 'storage/owned.pdf',
        congregationId: primaryCongId,
        actorId: ownerId,
      }),
    )

    const owned = await withScope(primaryCongId, tx => isDocumentOwnedByUploader(tx, created.id, ownerId))
    expect(owned).toBe(true)

    const notOwned = await withScope(primaryCongId, tx => isDocumentOwnedByUploader(tx, created.id, -1))
    expect(notOwned).toBe(false)

    await testDb.userAccount.delete({ where: { id: ownerId } })
  })

  it('returns false for legacy docs without a v1 row', async () => {
    const docId = await withScope(primaryCongId, async tx => {
      const doc = await tx.boardDocument.create({
        data: {
          title: `Legacy Doc ${ts}`,
          type: 'pdf',
          sectionId: primarySectionId,
          order: 0,
          congregationId: primaryCongId,
        },
      })
      return doc.id
    })

    const owned = await withScope(primaryCongId, tx => isDocumentOwnedByUploader(tx, docId, 1))
    expect(owned).toBe(false)
  })
})
