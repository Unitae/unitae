import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

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

const { setBoardItemsHighlighted } = await import('./board-highlight.server')

const ts = Date.now()
const ids = { cong: 0, other: 0, pdf: 0, pdfLeft: 0, dyn: 0, otherPdf: 0, actor: 0 }

async function createCongregation(label: string) {
  const congregation = await testDb.congregation.create({
    data: { name: `Board Highlight ${label} ${ts}`, slug: `board-highlight-${label}-${ts}`, active: true },
  })
  return congregation.id
}

beforeAll(async () => {
  ids.cong = await createCongregation('primary')
  ids.other = await createCongregation('other')

  await withScope(ids.cong, async tx => {
    const actor = await tx.userAccount.create({
      data: {
        email: `highlight-${ts}@test.com`,
        password: 'x',
        firstname: 'Ana',
        active: true,
        congregationId: ids.cong,
      },
    })
    ids.actor = actor.id
    const section = await tx.boardSection.create({ data: { name: 'Assemblée', order: 0, congregationId: ids.cong } })
    const pdf = (title: string) =>
      tx.boardDocument.create({ data: { title, sectionId: section.id, congregationId: ids.cong } })
    ids.pdf = (await pdf('Lettre')).id
    ids.pdfLeft = (await pdf('Comptes')).id
    const dyn = await tx.boardDynamicDocumentSettings.create({
      data: { title: 'Groupes', dynamicType: 'publisher-groups', sectionId: section.id, congregationId: ids.cong },
    })
    ids.dyn = dyn.id
  })

  await withScope(ids.other, async tx => {
    const section = await tx.boardSection.create({ data: { name: 'Autre', order: 0, congregationId: ids.other } })
    const doc = await tx.boardDocument.create({
      data: { title: 'Ailleurs', sectionId: section.id, congregationId: ids.other },
    })
    ids.otherPdf = doc.id
  })
})

afterAll(async () => {
  for (const congregationId of [ids.cong, ids.other]) {
    if (!congregationId) continue
    await withScope(congregationId, async tx => {
      await tx.boardDynamicDocumentSettings.deleteMany({})
      await tx.boardDocument.deleteMany({})
      await tx.boardSection.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [ids.cong, ids.other] } } })
  await testDb.$disconnect()
})

const highlighted = () =>
  withScope(ids.cong, async tx => ({
    pdfs: (await tx.boardDocument.findMany({ where: { isHighlighted: true }, select: { id: true } })).map(d => d.id),
    dyns: (
      await tx.boardDynamicDocumentSettings.findMany({ where: { isHighlighted: true }, select: { id: true } })
    ).map(d => d.id),
  }))

const run = (congregationId: number, pdfIds: number[], dynIds: number[], value: boolean) =>
  withScope(congregationId, tx =>
    setBoardItemsHighlighted(tx as never, { congregationId, actorId: ids.actor, pdfIds, dynIds, highlighted: value }),
  )

describe('setBoardItemsHighlighted', () => {
  it('puts the given PDFs and dynamic documents « à la une », and only those', async () => {
    const result = await run(ids.cong, [ids.pdf], [ids.dyn], true)

    expect(result).toEqual({ pdf: 1, dyn: 1 })
    expect(await highlighted()).toEqual({ pdfs: [ids.pdf], dyns: [ids.dyn] })
  })

  it('takes them off again', async () => {
    await run(ids.cong, [ids.pdf], [ids.dyn], false)

    expect(await highlighted()).toEqual({ pdfs: [], dyns: [] })
  })

  it("leaves another congregation's documents alone", async () => {
    const result = await run(ids.cong, [ids.otherPdf], [], true)

    expect(result).toEqual({ pdf: 0, dyn: 0 })
    const other = await withScope(ids.other, tx => tx.boardDocument.findFirst({ where: { id: ids.otherPdf } }))
    expect(other?.isHighlighted).toBe(false)
  })
})
