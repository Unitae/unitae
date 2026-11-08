import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

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

const { findViewableDocument, listBoardItems } = await import('./board-reading.queries')

const ts = Date.now()
const now = new Date('2026-11-08T12:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)

let congregationId: number
let readerId: number
const ids: Record<string, number> = {}

beforeAll(async () => {
  const congregation = await testDb.congregation.create({
    data: { name: `Board Reading ${ts}`, slug: `board-reading-${ts}`, active: true },
  })
  congregationId = congregation.id

  await withScope(congregationId, async tx => {
    const reader = await tx.userAccount.create({
      data: { email: `board-reading-${ts}@test.com`, password: 'hashed', active: true, congregationId },
    })
    readerId = reader.id

    const open = await tx.boardSection.create({ data: { name: 'Assemblée', order: 1, congregationId } })
    const restricted = await tx.boardSection.create({ data: { name: 'Anciens', order: 2, congregationId } })
    const role = await tx.role.create({ data: { key: `board-reading-${ts}`, isBuiltIn: false, congregationId } })
    await tx.boardSectionVisibilityRole.create({ data: { sectionId: restricted.id, roleId: role.id, congregationId } })
    ids.open = open.id

    const pdf = async (key: string, data: { title: string; createdAt: Date; sectionId?: number }, extra = {}) => {
      const doc = await tx.boardDocument.create({
        data: {
          title: data.title,
          createdAt: data.createdAt,
          sectionId: data.sectionId ?? open.id,
          visibleFrom: daysAgo(30),
          congregationId,
          ...extra,
        },
      })
      ids[key] = doc.id
      return doc
    }
    const version = (documentId: number, createdAt: Date, versionNumber: number) =>
      tx.boardDocumentVersion.create({
        data: { documentId, uri: `u-${versionNumber}`, versionNumber, createdAt, congregationId },
      })
    const read = (documentId: number, viewedAt: Date | null) =>
      tx.boardDocumentView.create({ data: { documentId, userId: readerId, viewedAt, congregationId } })

    const fresh = await pdf('fresh', { title: 'Fresh', createdAt: daysAgo(1) })
    await version(fresh.id, fresh.createdAt, 1)

    const opened = await pdf('opened', { title: 'Opened', createdAt: daysAgo(10) })
    await version(opened.id, opened.createdAt, 1)
    await read(opened.id, daysAgo(5))

    const replaced = await pdf('replaced', { title: 'Replaced', createdAt: daysAgo(10) }, { isHighlighted: true })
    await version(replaced.id, replaced.createdAt, 1)
    await version(replaced.id, daysAgo(2), 2)
    await read(replaced.id, daysAgo(5))

    const legacy = await pdf('legacy', { title: 'Legacy read', createdAt: daysAgo(40) })
    await version(legacy.id, daysAgo(3), 1)
    await read(legacy.id, null)

    await pdf('expired', { title: 'Expired', createdAt: daysAgo(20) }, { visibleUntil: daysAgo(1) })
    await pdf('draft', { title: 'Draft', createdAt: daysAgo(2) }, { visibleFrom: null })
    await pdf('hidden', { title: 'Restricted', createdAt: daysAgo(2), sectionId: restricted.id })
  })
})

afterAll(async () => {
  if (!congregationId) return
  await withScope(congregationId, async tx => {
    await tx.boardDocumentView.deleteMany({})
    await tx.boardDocumentVersion.deleteMany({})
    await tx.boardDocument.deleteMany({})
    await tx.boardSectionVisibilityRole.deleteMany({})
    await tx.boardSection.deleteMany({})
    await tx.role.deleteMany({})
    await tx.userAccount.deleteMany({})
  })
  await testDb.congregation.deleteMany({ where: { id: congregationId } })
  await testDb.$disconnect()
})

const board = () =>
  withScope(congregationId, tx => listBoardItems(tx as never, { userId: readerId, congregationId, now }))
const item = async (key: string) => (await board()).items.find(i => i.kind === 'pdf' && i.id === ids[key])

describe('listBoardItems', () => {
  it('lists what this person can see today, in the sections they can see', async () => {
    const { sections, items } = await board()

    expect(sections.map(s => s.name)).toEqual(['Assemblée'])
    expect(items.map(i => i.title).sort()).toEqual(['Fresh', 'Legacy read', 'Opened', 'Replaced'])
  })

  it('calls a document nobody opened new', async () => {
    expect(await item('fresh')).toMatchObject({ unread: true, badge: 'new', replacedAt: null })
  })

  it('counts a document read when nothing changed after the read', async () => {
    expect(await item('opened')).toMatchObject({ unread: false, badge: null })
  })

  it('makes a replaced document unread again, with when it was replaced', async () => {
    expect(await item('replaced')).toMatchObject({
      unread: true,
      badge: 'updated',
      replacedAt: daysAgo(2),
      isHighlighted: true,
    })
  })

  it('takes a read recorded before dates were kept as a read of the current file', async () => {
    expect(await item('legacy')).toMatchObject({ unread: false, badge: null })
  })

  it('counts what is unread', async () => {
    expect((await board()).unreadCount).toBe(2)
  })
})

describe('findViewableDocument', () => {
  const find = (key: string) =>
    withScope(congregationId, tx =>
      findViewableDocument(tx as never, { documentId: ids[key], userId: readerId, congregationId }),
    )

  it('gives the viewer what it shows: title, section and when the file arrived and was replaced', async () => {
    expect(await find('replaced')).toMatchObject({
      title: 'Replaced',
      sectionName: 'Assemblée',
      createdAt: daysAgo(10),
      replacedAt: daysAgo(2),
      visibleUntil: null,
    })
  })

  it('finds nothing in a section this person cannot see', async () => {
    expect(await find('hidden')).toBeNull()
  })
})
