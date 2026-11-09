import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { Permission } from '~/shared/types/permission'

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

const { countHighlighted, findDisplayStart, findVersionFile, loadPdfForm } = await import('./document-form.queries')

const ts = Date.now()
const now = new Date('2026-11-09T12:00:00Z')
const days = (d: number) => new Date(now.getTime() + d * 86_400_000)
const ids = { cong: 0, other: 0, doc: 0, otherDoc: 0, v1: 0, v2: 0, otherVersion: 0, sectionA: 0, sectionB: 0 }

async function createCongregation(label: string) {
  const congregation = await testDb.congregation.create({
    data: { name: `Document Form ${label} ${ts}`, slug: `document-form-${label}-${ts}`, active: true },
  })
  return congregation.id
}

beforeAll(async () => {
  ids.cong = await createCongregation('primary')
  ids.other = await createCongregation('other')
  const viewBoard = (
    await testDb.permission.upsert({
      where: { key: Permission.CanViewBoard },
      update: {},
      create: { key: Permission.CanViewBoard },
    })
  ).id

  await withScope(ids.cong, async tx => {
    const role = await tx.role.create({ data: { key: `viewer-${ts}`, isBuiltIn: false, congregationId: ids.cong } })
    await tx.rolePermission.create({ data: { roleId: role.id, permissionId: viewBoard, congregationId: ids.cong } })
    const account = (key: string, extra: { anonymizedAt?: Date } = {}) =>
      tx.userAccount.create({
        data: {
          email: `${key}-${ts}@document-form.test`,
          password: 'x',
          firstname: key === 'ana' ? 'Ana' : 'Ben',
          lastname: 'Martin',
          active: true,
          congregationId: ids.cong,
          ...extra,
        },
      })
    const ana = await account('ana')
    const ben = await account('ben')
    for (const user of [ana, ben]) {
      await tx.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id, congregationId: ids.cong } })
    }

    ids.sectionB = (
      await tx.boardSection.create({ data: { name: 'Vie chrétienne', order: 2, congregationId: ids.cong } })
    ).id
    ids.sectionA = (
      await tx.boardSection.create({ data: { name: 'Assemblée', order: 1, congregationId: ids.cong } })
    ).id

    const doc = await tx.boardDocument.create({
      data: {
        title: 'Lettre',
        sectionId: ids.sectionA,
        createdAt: days(-20),
        visibleFrom: days(-20),
        visibleUntil: days(10),
        congregationId: ids.cong,
      },
    })
    ids.doc = doc.id
    const version = (versionNumber: number, createdAt: Date, uri: string) =>
      tx.boardDocumentVersion.create({
        data: { documentId: doc.id, uri, versionNumber, createdAt, uploadedById: ana.id, congregationId: ids.cong },
      })
    ids.v1 = (await version(1, days(-20), 'v1.pdf')).id
    ids.v2 = (await version(2, days(-2), 'v2.pdf')).id
    await tx.boardDocumentView.create({
      data: { documentId: doc.id, userId: ben.id, viewedAt: days(-1), congregationId: ids.cong },
    })

    await tx.boardDocument.create({
      data: { title: 'Comptes', sectionId: ids.sectionA, isHighlighted: true, congregationId: ids.cong },
    })
    await tx.boardDynamicDocumentSettings.create({
      data: {
        title: 'Groupes',
        dynamicType: 'publisher-groups',
        sectionId: ids.sectionB,
        isHighlighted: true,
        congregationId: ids.cong,
      },
    })
  })

  await withScope(ids.other, async tx => {
    const section = await tx.boardSection.create({ data: { name: 'Autre', order: 0, congregationId: ids.other } })
    const doc = await tx.boardDocument.create({
      data: { title: 'Ailleurs', sectionId: section.id, congregationId: ids.other },
    })
    ids.otherDoc = doc.id
    const version = await tx.boardDocumentVersion.create({
      data: { documentId: doc.id, uri: 'elsewhere.pdf', versionNumber: 1, congregationId: ids.other },
    })
    ids.otherVersion = version.id
  })
})

afterAll(async () => {
  for (const congregationId of [ids.cong, ids.other]) {
    if (!congregationId) continue
    await withScope(congregationId, async tx => {
      await tx.boardDocumentView.deleteMany({})
      await tx.boardDocumentVersion.deleteMany({})
      await tx.boardDocument.deleteMany({})
      await tx.boardDynamicDocumentSettings.deleteMany({})
      await tx.boardSection.deleteMany({})
      await tx.userRoleAssignment.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.rolePermission.deleteMany({})
      await tx.role.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [ids.cong, ids.other] } } })
  await testDb.$disconnect()
})

const scoped = <T>(fn: (tx: never) => Promise<T>) => withScope(ids.cong, tx => fn(tx as never))

describe('loadPdfForm', () => {
  it('gives the document, the sections in order and its versions newest first, with who uploaded each', async () => {
    const form = await scoped(tx => loadPdfForm(tx, { documentId: ids.doc, congregationId: ids.cong, now }))

    expect(form?.document).toMatchObject({ title: 'Lettre', sectionId: ids.sectionA, isHighlighted: false })
    expect(form?.sections.map(s => s.name)).toEqual(['Assemblée', 'Vie chrétienne'])
    expect(form?.versions.map(v => [v.versionNumber, v.uploadedBy])).toEqual([
      [2, 'Ana Martin'],
      [1, 'Ana Martin'],
    ])
  })

  it('counts who read the current file among the people who can see its section, and the others « à la une »', async () => {
    const form = await scoped(tx => loadPdfForm(tx, { documentId: ids.doc, congregationId: ids.cong, now }))

    expect(form?.reads).toEqual({ read: 1, audience: 2 })
    expect(form?.highlightedOthers).toBe(2)
  })

  it('shows the card as someone who has not opened it sees it, replaced two days ago', async () => {
    const form = await scoped(tx => loadPdfForm(tx, { documentId: ids.doc, congregationId: ids.cong, now }))

    expect(form?.card).toMatchObject({ kind: 'pdf', title: 'Lettre', unread: true, replacedAt: days(-2) })
  })

  it("finds nothing of another congregation's document", async () => {
    const form = await scoped(tx => loadPdfForm(tx, { documentId: ids.otherDoc, congregationId: ids.cong, now }))

    expect(form).toBeNull()
  })
})

describe('findVersionFile', () => {
  it('gives the file of an earlier version, named after its document', async () => {
    const file = await scoped(tx =>
      findVersionFile(tx, { documentId: ids.doc, versionId: ids.v1, congregationId: ids.cong }),
    )

    expect(file).toEqual({ title: 'Lettre', uri: 'v1.pdf', versionNumber: 1 })
  })

  it('finds nothing for a version of another document', async () => {
    const file = await scoped(tx =>
      findVersionFile(tx, { documentId: ids.doc, versionId: ids.otherVersion, congregationId: ids.cong }),
    )

    expect(file).toBeNull()
  })
})

describe('countHighlighted', () => {
  it('counts the PDFs and dynamic documents « à la une », leaving out the one being edited', async () => {
    expect(await scoped(tx => countHighlighted(tx, ids.cong))).toBe(2)
    expect(await scoped(tx => countHighlighted(tx, ids.cong, { kind: 'dynamic', id: 0 }))).toBe(2)
  })
})

describe('findDisplayStart', () => {
  it("gives the document's start, and nothing for another congregation's", async () => {
    expect(await scoped(tx => findDisplayStart(tx, ids.doc, ids.cong))).toEqual({ visibleFrom: days(-20) })
    expect(await scoped(tx => findDisplayStart(tx, ids.otherDoc, ids.cong))).toBeNull()
  })
})
