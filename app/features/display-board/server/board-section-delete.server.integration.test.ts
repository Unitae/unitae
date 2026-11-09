import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

const { deleted } = vi.hoisted(() => ({ deleted: [] as string[] }))
vi.mock('./document-storage.server', async importOriginal => ({
  ...(await importOriginal<object>()),
  deleteBoardFile: vi.fn(async (key: string) => {
    deleted.push(key)
  }),
}))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))

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

const { deleteBoardSection, loadSectionDeletion } = await import('./board-section-delete.server')

const ts = Date.now()
let congregationId = 0
let otherCongregationId = 0
let otherSectionId = 0
let actorId = 0

async function createCongregation(label: string) {
  const congregation = await testDb.congregation.create({
    data: { name: `Section Delete ${label} ${ts}`, slug: `section-delete-${label}-${ts}`, active: true },
  })
  return congregation.id
}

/** A section holding a PDF with two versions and a dynamic document, and a second section. */
async function fixture(label: string) {
  return withScope(congregationId, async tx => {
    const section = await tx.boardSection.create({ data: { name: `Retirée ${label}`, order: 0, congregationId } })
    const target = await tx.boardSection.create({ data: { name: `Gardée ${label}`, order: 1, congregationId } })
    const pdf = await tx.boardDocument.create({
      data: {
        title: 'Lettre',
        sectionId: section.id,
        uri: `${label}-v2.pdf`,
        thumbnailUri: `${label}.png`,
        congregationId,
      },
    })
    for (const [versionNumber, uri] of [
      [1, `${label}-v1.pdf`],
      [2, `${label}-v2.pdf`],
    ] as const) {
      await tx.boardDocumentVersion.create({
        data: { documentId: pdf.id, uri, versionNumber, uploadedById: actorId, congregationId },
      })
    }
    const dynamic = await tx.boardDynamicDocumentSettings.create({
      data: { title: 'Groupes', dynamicType: 'publisher-groups', sectionId: section.id, congregationId },
    })
    return { section: section.id, target: target.id, pdf: pdf.id, dynamic: dynamic.id }
  })
}

beforeAll(async () => {
  congregationId = await createCongregation('primary')
  otherCongregationId = await createCongregation('other')
  await withScope(congregationId, async tx => {
    const actor = await tx.userAccount.create({
      data: { email: `section-delete-${ts}@test.com`, password: 'x', active: true, congregationId },
    })
    actorId = actor.id
  })
  otherSectionId = await withScope(otherCongregationId, async tx => {
    const section = await tx.boardSection.create({
      data: { name: 'Ailleurs', order: 0, congregationId: otherCongregationId },
    })
    return section.id
  })
})

beforeEach(() => {
  deleted.length = 0
})

afterAll(async () => {
  for (const id of [congregationId, otherCongregationId]) {
    if (!id) continue
    await withScope(id, async tx => {
      await tx.boardDocumentVersion.deleteMany({})
      await tx.boardDocument.deleteMany({})
      await tx.boardDynamicDocumentSettings.deleteMany({})
      await tx.boardSection.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [congregationId, otherCongregationId] } } })
  await testDb.$disconnect()
})

const run = (sectionId: number, moveTo: number | null) =>
  withScope(congregationId, tx => deleteBoardSection(tx as never, { sectionId, congregationId, actorId, moveTo }))

describe('deleteBoardSection', () => {
  it('moves its documents, the dynamic one too, to the section chosen, and deletes no file', async () => {
    const ids = await fixture('move')

    const result = await run(ids.section, ids.target)

    expect(result).toEqual({ name: 'Retirée move', moved: 2, deleted: 0 })
    const after = await withScope(congregationId, async tx => ({
      section: await tx.boardSection.findFirst({ where: { id: ids.section } }),
      pdf: await tx.boardDocument.findFirst({ where: { id: ids.pdf } }),
      dynamic: await tx.boardDynamicDocumentSettings.findFirst({ where: { id: ids.dynamic } }),
    }))
    expect(after.section).toBeNull()
    expect([after.pdf?.sectionId, after.dynamic?.sectionId]).toEqual([ids.target, ids.target])
    expect(deleted).toEqual([])
  })

  it('deletes its documents with it, every version file of a PDF included', async () => {
    const ids = await fixture('drop')

    const result = await run(ids.section, null)

    expect(result).toEqual({ name: 'Retirée drop', moved: 0, deleted: 2 })
    const left = await withScope(congregationId, async tx =>
      [
        await tx.boardDocument.count({ where: { id: ids.pdf } }),
        await tx.boardDynamicDocumentSettings.count({ where: { id: ids.dynamic } }),
      ].join(','),
    )
    expect(left).toBe('0,0')
    expect([...deleted].sort()).toEqual(['drop-v1.pdf', 'drop-v2.pdf', 'drop.png'])
  })

  it('changes nothing when asked to move the documents into itself or into another congregation', async () => {
    const ids = await fixture('refused')

    expect(await run(ids.section, ids.section)).toBeNull()
    expect(await run(ids.section, otherSectionId)).toBeNull()
    const kept = await withScope(congregationId, tx => tx.boardSection.count({ where: { id: ids.section } }))
    expect(kept).toBe(1)
  })
})

describe('loadSectionDeletion', () => {
  it('says what the section holds and where its documents could go', async () => {
    const ids = await fixture('load')

    const loaded = await withScope(congregationId, tx => loadSectionDeletion(tx as never, ids.section, congregationId))

    expect(loaded?.section.name).toBe('Retirée load')
    expect(loaded?.documents).toBe(2)
    expect(loaded?.targets.map(t => t.id)).toContain(ids.target)
    expect(loaded?.targets.map(t => t.id)).not.toContain(ids.section)
  })

  it("finds nothing of another congregation's section", async () => {
    const loaded = await withScope(congregationId, tx =>
      loadSectionDeletion(tx as never, otherSectionId, congregationId),
    )

    expect(loaded).toBeNull()
  })
})
